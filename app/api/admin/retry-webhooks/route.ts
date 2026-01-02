/**
 * Admin Endpoint: Retry Failed Webhooks
 *
 * Can be called manually or via cron (Vercel Cron or external service)
 * GET /api/admin/retry-webhooks?secret=WEBHOOK_SECRET
 */

import { NextResponse } from 'next/server';
import { webhookRetryService } from '@/lib/webhook-retry-service';
import { webhookLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const startTime = Date.now();

  try {
    // Verify secret (supports both URL param and Vercel Cron Bearer token)
    const url = new URL(request.url);
    const urlSecret = url.searchParams.get('secret');
    const authHeader = request.headers.get('authorization');

    const expectedSecret = process.env.WEBHOOK_SECRET;
    const cronSecret = process.env.CRON_SECRET || expectedSecret;

    // Check URL parameter auth (manual calls)
    const urlAuthValid = urlSecret && urlSecret === expectedSecret;

    // Check Bearer token auth (Vercel Cron)
    const bearerAuthValid = authHeader && authHeader === `Bearer ${cronSecret}`;

    if (!urlAuthValid && !bearerAuthValid) {
      webhookLogger.warn('retry_unauthorized', 'Unauthorized retry attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Run retry service
    webhookLogger.info('retry_started', 'Webhook retry job started');

    const stats = await webhookRetryService.retryFailedWebhooks();

    const duration = Date.now() - startTime;

    webhookLogger.info('retry_completed', 'Webhook retry job completed', {
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

    webhookLogger.error('retry_error', 'Webhook retry job error', error, {
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

// Support POST for compatibility with cron services
export async function POST(request: Request) {
  return GET(request);
}
