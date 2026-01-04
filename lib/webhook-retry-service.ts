/**
 * Webhook Retry Service
 *
 * Automatically retries failed webhook processing with exponential backoff
 * Designed to be called by Vercel Cron Jobs every 5 minutes
 */

import { prisma } from './prisma';
import { PmsFactory } from './pms/PmsFactory';
import { PmsType } from '@prisma/client';
import { webhookLogger } from './logger';

export class WebhookRetryService {
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS = [60, 300, 900]; // 1min, 5min, 15min (seconds)

  /**
   * Retry all failed webhooks that are ready for retry
   */
  async retryFailedWebhooks(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    const stats = {
      processed: 0,
      succeeded: 0,
      failed: 0,
    };

    try {
      // Find unprocessed webhooks with retryCount < MAX_RETRIES
      const failedEvents = await prisma.webhookEvent.findMany({
        where: {
          processed: false,
          retryCount: { lt: this.MAX_RETRIES },
        },
        orderBy: { createdAt: 'asc' },
        take: 50, // Process in batches to avoid overwhelming DB
      });

      webhookLogger.info('retry_batch_started', 'Starting webhook retry batch', {
        eventsToRetry: failedEvents.length,
      });

      for (const event of failedEvents) {
        // Check if enough time has passed since last retry
        const delaySeconds = this.RETRY_DELAYS[event.retryCount] || 900;
        const nextRetryTime = new Date(
          event.createdAt.getTime() + delaySeconds * 1000
        );

        if (new Date() < nextRetryTime) {
          // Skip, not ready for retry yet
          continue;
        }

        stats.processed++;
        const success = await this.retryWebhookEvent(event);
        if (success) {
          stats.succeeded++;
        } else {
          stats.failed++;
        }
      }

      webhookLogger.info('retry_batch_completed', 'Webhook retry batch completed', stats);

      // Check for critical failures and alert
      await this.checkAndAlert();

      return stats;
    } catch (error: any) {
      webhookLogger.error('retry_batch_error', 'Error during webhook retry batch', error);
      throw error;
    }
  }

  /**
   * Retry a single webhook event
   */
  private async retryWebhookEvent(event: any): Promise<boolean> {
    try {
      if (!event.hotelId) {
        webhookLogger.error('retry_no_hotel', 'Cannot retry webhook without hotelId', undefined, {
          eventId: event.id,
        });
        return false;
      }

      // Get hotel to determine PMS type
      const hotel = await prisma.hotel.findUnique({
        where: { id: event.hotelId },
      });

      if (!hotel) {
        webhookLogger.error('retry_hotel_not_found', 'Hotel not found for retry', undefined, {
          hotelId: event.hotelId,
          eventId: event.id,
        });

        // Mark as failed permanently (hotel was deleted)
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            retryCount: this.MAX_RETRIES,
            error: 'Hotel not found (deleted)',
          },
        });

        return false;
      }

      webhookLogger.info('retry_attempt', 'Retrying webhook event', {
        eventId: event.id,
        hotelId: event.hotelId,
        pmsType: hotel.pmsType,
        retryCount: event.retryCount,
        previousError: event.error,
      });

      // Create webhook handler
      const handler = PmsFactory.createWebhookHandler(
        hotel.id,
        hotel.pmsType as PmsType
      );

      // Re-process webhook
      const payload = event.payload;
      const result = await handler.processWebhook(payload, {});

      if (result.success) {
        // Mark as processed
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            processed: true,
            processedAt: new Date(),
            error: null,
          },
        });

        webhookLogger.info('retry_success', 'Webhook retry succeeded', {
          eventId: event.id,
          hotelId: event.hotelId,
          retryCount: event.retryCount,
        });

        return true;
      } else {
        // Increment retry count
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            retryCount: event.retryCount + 1,
            error: result.errors?.join(', ') || 'Processing failed',
          },
        });

        webhookLogger.warn('retry_failed', 'Webhook retry failed', {
          eventId: event.id,
          hotelId: event.hotelId,
          retryCount: event.retryCount + 1,
          errors: result.errors,
        });

        return false;
      }
    } catch (error: any) {
      webhookLogger.error('retry_error', 'Error retrying webhook', error, {
        eventId: event.id,
      });

      // Increment retry count on error
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          retryCount: event.retryCount + 1,
          error: error.message || 'Unknown retry error',
        },
      });

      return false;
    }
  }

  /**
   * Check for critical failures and send alerts
   */
  async checkAndAlert(): Promise<void> {
    try {
      // Count webhooks that have failed max retries in the last hour
      const criticalFailures = await prisma.webhookEvent.count({
        where: {
          processed: false,
          retryCount: { gte: this.MAX_RETRIES },
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
        },
      });

      if (criticalFailures > 5) {
        // ALERT: Too many webhooks failed permanently
        webhookLogger.error(
          'critical_webhook_failures',
          `ALERT: ${criticalFailures} webhooks failed max retries in last hour`,
          undefined,
          {
            criticalFailures,
            threshold: 5,
          }
        );

        // TODO: Integrate with external alerting services
        // - SendGrid for email alerts
        // - Slack webhook
        // - Sentry/DataDog
        // - Vercel Log Drains
        console.error(
          `🚨 CRITICAL ALERT: ${criticalFailures} webhooks have failed max retries in the last hour!`
        );
      }
    } catch (error: any) {
      webhookLogger.error('alert_check_error', 'Error checking for alerts', error);
    }
  }

  /**
   * Get retry statistics
   */
  async getRetryStats(): Promise<{
    pendingRetry: number;
    maxRetriesFailed: number;
    total24h: number;
    successful24h: number;
  }> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [pendingRetry, maxRetriesFailed, total24h, successful24h] =
      await Promise.all([
        // Webhooks waiting for retry
        prisma.webhookEvent.count({
          where: { processed: false, retryCount: { lt: this.MAX_RETRIES } },
        }),

        // Webhooks that have failed max retries
        prisma.webhookEvent.count({
          where: { processed: false, retryCount: { gte: this.MAX_RETRIES } },
        }),

        // Total webhooks in last 24h
        prisma.webhookEvent.count({
          where: { createdAt: { gte: oneDayAgo } },
        }),

        // Successful webhooks in last 24h
        prisma.webhookEvent.count({
          where: { createdAt: { gte: oneDayAgo }, processed: true },
        }),
      ]);

    return {
      pendingRetry,
      maxRetriesFailed,
      total24h,
      successful24h,
    };
  }
}

// Export singleton instance
export const webhookRetryService = new WebhookRetryService();
