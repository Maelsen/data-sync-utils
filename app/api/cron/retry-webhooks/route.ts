/**
 * Cron Job: Retry Failed Webhooks
 *
 * Vercel Cron Job that runs every 5 minutes to retry failed webhooks
 * Configure in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/retry-webhooks",
 *     "schedule": "*/5 * * * *"
 *   }]
 * }
 */

import { NextResponse } from 'next/server';
import { webhookRetryService } from '@/lib/webhook-retry-service';
import { webhookLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const startTime = Date.now();

  try {
    // Verify cron secret (Vercel Cron sends this header)
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.CRON_SECRET || process.env.WEBHOOK_SECRET;

    if (!expectedSecret) {
      webhookLogger.error(
        'cron_no_secret',
        'CRON_SECRET not configured in environment'
      );
      return NextResponse.json(
        { error: 'Cron secret not configured' },
        { status: 500 }
      );
    }

    // Vercel Cron sends: Bearer <CRON_SECRET>
    const expectedAuth = `Bearer ${expectedSecret}`;

    if (authHeader !== expectedAuth) {
      webhookLogger.warn('cron_unauthorized', 'Unauthorized cron access attempt', {
        hasAuth: !!authHeader,
        authLength: authHeader?.length || 0,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Run retry service
    webhookLogger.info('cron_retry_started', 'Cron job: Webhook retry started');

    const stats = await webhookRetryService.retryFailedWebhooks();

    const duration = Date.now() - startTime;

    webhookLogger.info('cron_retry_completed', 'Cron job: Webhook retry completed', {
      ...stats,
      duration,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Webhook retry job completed',
        stats,
        duration,
      },
      { status: 200 }
    );
  } catch (error: any) {
    const duration = Date.now() - startTime;

    webhookLogger.error('cron_retry_error', 'Cron job: Webhook retry error', error, {
      duration,
    });

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggering via API
export async function POST(request: Request) {
  return GET(request);
}
