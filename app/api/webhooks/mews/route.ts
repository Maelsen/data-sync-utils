// Webhook endpoint for receiving Mews events
// POST /api/webhooks/mews?secret=YOUR_SECRET

import { NextResponse } from 'next/server';
import { webhookHandler, MewsWebhookEvent } from '@/lib/webhook-handler';
import { webhookLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Verify webhook secret from URL parameter
function verifySecret(urlSecret: string | null): boolean {
    if (!urlSecret) {
        webhookLogger.warn('secret_missing', 'No secret provided in URL');
        return false;
    }

    const expectedSecret = process.env.WEBHOOK_SECRET;
    if (!expectedSecret) {
        webhookLogger.error('secret_not_configured', 'WEBHOOK_SECRET not configured in environment');
        return false;
    }

    // Simple string comparison (constant-time to prevent timing attacks)
    if (urlSecret.length !== expectedSecret.length) {
        return false;
    }

    let mismatch = 0;
    for (let i = 0; i < urlSecret.length; i++) {
        mismatch |= urlSecret.charCodeAt(i) ^ expectedSecret.charCodeAt(i);
    }

    return mismatch === 0;
}

export async function POST(request: Request) {
    const startTime = Date.now();

    try {
        // Get secret from URL parameter
        const url = new URL(request.url);
        const urlSecret = url.searchParams.get('secret');

        // Verify secret
        if (!verifySecret(urlSecret)) {
            webhookLogger.warn('secret_invalid', 'Invalid webhook secret', {
                hasSecret: !!urlSecret,
                secretLength: urlSecret?.length || 0,
            });
            return NextResponse.json(
                { error: 'Invalid or missing secret' },
                { status: 401 }
            );
        }

        // Get raw body
        const rawBody = await request.text();

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
export async function GET(request: Request) {
    // Get secret from URL parameter for testing
    const url = new URL(request.url);
    const urlSecret = url.searchParams.get('secret');

    const secretValid = verifySecret(urlSecret);

    return NextResponse.json({
        status: 'ok',
        endpoint: '/api/webhooks/mews',
        message: 'Webhook endpoint is ready',
        secretProvided: !!urlSecret,
        secretValid: secretValid,
        timestamp: new Date().toISOString(),
    });
}
