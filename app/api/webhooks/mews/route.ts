// Webhook endpoint for receiving Mews events
// POST /api/webhooks/mews?secret=YOUR_SECRET

import { NextResponse } from 'next/server';
import { webhookHandler, MewsWebhookEnvelope } from '@/lib/webhook-handler';
import { webhookLogger } from '@/lib/logger';
import { syncTreeOrdersV2 } from '@/lib/sync-v2';

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

        // LOG RAW PAYLOAD FOR DEBUGGING
        console.log('=== MEWS WEBHOOK RAW PAYLOAD ===');
        console.log(rawBody);
        console.log('=== END RAW PAYLOAD ===');

        // Parse event as envelope
        const envelope: MewsWebhookEnvelope = JSON.parse(rawBody);

        // LOG PARSED ENVELOPE
        webhookLogger.info('webhook_parsed', 'Parsed webhook envelope', {
            fullPayload: envelope, // Log the complete parsed object
        });

        // Basic validation
        if (!envelope.Events && !envelope.EnterpriseId) {
            webhookLogger.warn('invalid_payload', 'Received payload does not look like a Mews envelope');
        }

        webhookLogger.info('webhook_received', `Received webhook envelope`, {
            eventsCount: envelope.Events?.length || 0,
            enterpriseId: envelope.EnterpriseId
        });

        // Process event asynchronously (don't block response)
        // Mews expects a quick 200 OK response

        // Trigger auto-sync
        webhookLogger.info('triggering_sync', 'Triggering automatic sync after webhook');
        syncTreeOrdersV2().catch((error: any) => {
            webhookLogger.error('auto_sync_failed', 'Automatic sync triggers by webhook failed', error, {
                // eventId: event.Id // No single event ID anymore
            });
        });

        webhookHandler.processEnvelope(envelope).catch((error) => {
            webhookLogger.error('async_process_failed', 'Failed to process envelope async', error, {
                enterpriseId: envelope.EnterpriseId
            });
        });

        const duration = Date.now() - startTime;

        // Return success immediately
        return NextResponse.json(
            {
                success: true,
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
