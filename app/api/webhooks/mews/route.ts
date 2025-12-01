// Webhook endpoint for receiving Mews events
// POST /api/webhooks/mews

import { NextResponse } from 'next/server';
import { webhookHandler, MewsWebhookEvent } from '@/lib/webhook-handler';
import { webhookLogger } from '@/lib/logger';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Verify webhook signature (Mews sends a signature header)
function verifySignature(payload: string, signature: string | null): boolean {
    if (!signature) {
        webhookLogger.warn('signature_missing', 'No signature provided');
        return false;
    }

    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) {
        webhookLogger.error('secret_missing', 'WEBHOOK_SECRET not configured');
        return false;
    }

    try {
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');

        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    } catch (error) {
        webhookLogger.error('signature_verify_failed', 'Signature verification failed', error as Error);
        return false;
    }
}

export async function POST(request: Request) {
    const startTime = Date.now();

    try {
        // Get raw body for signature verification
        const rawBody = await request.text();
        const signature = request.headers.get('x-mews-signature');

        // Verify signature if webhook secret is configured
        if (process.env.WEBHOOK_SECRET) {
            if (!verifySignature(rawBody, signature)) {
                webhookLogger.warn('signature_invalid', 'Invalid webhook signature');
                return NextResponse.json(
                    { error: 'Invalid signature' },
                    { status: 401 }
                );
            }
        }

        // Parse event
        const event: MewsWebhookEvent = JSON.parse(rawBody);

        webhookLogger.info('webhook_received', `Received ${event.Type} event`, {
            eventId: event.Id,
            eventType: event.Type,
        });

        // Process event asynchronously (don't block response)
        // Mews expects a quick 200 OK response
        webhookHandler.processEvent(event).catch((error) => {
            webhookLogger.error('async_process_failed', 'Failed to process event async', error, {
                eventId: event.Id,
            });
        });

        const duration = Date.now() - startTime;

        // Return success immediately
        return NextResponse.json(
            {
                success: true,
                eventId: event.Id,
                message: 'Event received and queued for processing',
            },
            { status: 200, headers: { 'X-Processing-Time': `${duration}ms` } }
        );

    } catch (error: any) {
        const duration = Date.now() - startTime;

        webhookLogger.error('webhook_error', 'Webhook processing error', error, {
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

// Health check for webhook endpoint
export async function GET() {
    return NextResponse.json({
        status: 'ok',
        endpoint: '/api/webhooks/mews',
        message: 'Webhook endpoint is ready',
        timestamp: new Date().toISOString(),
    });
}
