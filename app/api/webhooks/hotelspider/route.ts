/**
 * Webhook endpoint for receiving HotelSpider OTA_HotelResNotifRQ notifications
 * POST /api/webhooks/hotelspider
 *
 * Authentication: HTTP Basic Auth (credentials from database)
 * Content-Type: application/xml
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PmsFactory } from '@/lib/pms/PmsFactory';
import { webhookLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    // Get raw XML body
    const rawPayload = await request.text();

    // Get headers
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Extract hotel from Basic Auth username
    // Format: "hotelCode:password" in Basic Auth
    const authHeader = headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      webhookLogger.warn('hotelspider_no_auth', 'Missing or invalid Authorization header');
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header' },
        { status: 401 }
      );
    }

    // Decode credentials to get hotel code
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username] = credentials.split(':');

    // Find hotel by HotelSpider hotel code (stored in credentials)
    const hotelWithCredentials = await prisma.hotel.findFirst({
      where: {
        pmsType: 'hotelspider',
        credentials: {
          hotelspiderHotelCode: username,
        },
      },
      include: {
        credentials: true,
      },
    });

    if (!hotelWithCredentials) {
      webhookLogger.warn('hotelspider_hotel_not_found', 'Hotel not found for hotel code', {
        username,
      });
      return NextResponse.json(
        { error: 'Hotel not found' },
        { status: 404 }
      );
    }

    const hotelId = hotelWithCredentials.id;

    // Log raw payload for debugging
    console.log('=== HOTELSPIDER WEBHOOK RAW XML ===');
    console.log(rawPayload);
    console.log('=== END RAW XML ===');

    // Create webhook handler for this hotel
    const handler = PmsFactory.createWebhookHandler(hotelId, 'hotelspider');

    // Process webhook
    const result = await handler.processWebhook(rawPayload, headers);

    // Calculate duration
    const duration = Date.now() - startTime;

    if (!result.success) {
      // Webhook processing failed
      webhookLogger.error('hotelspider_process_failed', 'HotelSpider webhook processing failed', {
        hotelId,
        errors: result.errors,
        duration,
      });

      // Store webhook event as failed
      await prisma.webhookEvent.create({
        data: {
          hotelId,
          pmsType: 'hotelspider',
          eventId: result.metadata?.eventId || null,
          eventType: 'OTA_HotelResNotifRQ',
          payload: rawPayload,
          processed: false,
          error: result.errors?.join(', ') || 'Processing failed',
          retryCount: 0,
        },
      });

      return NextResponse.json(
        {
          success: false,
          errors: result.errors,
        },
        { status: 400 }
      );
    }

    // Success
    webhookLogger.info('hotelspider_webhook_success', 'HotelSpider webhook processed successfully', {
      hotelId,
      ordersProcessed: result.processedOrders?.length || 0,
      duplicate: result.metadata?.duplicate || false,
      eventId: result.metadata?.eventId,
      duration,
    });

    // Store webhook event as processed (if not duplicate)
    if (!result.metadata?.duplicate) {
      await prisma.webhookEvent.create({
        data: {
          hotelId,
          pmsType: 'hotelspider',
          eventId: result.metadata?.eventId || null,
          eventType: 'OTA_HotelResNotifRQ',
          payload: rawPayload,
          processed: true,
          processedAt: new Date(),
          retryCount: 0,
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        ordersProcessed: result.processedOrders?.length || 0,
        duplicate: result.metadata?.duplicate || false,
      },
      { status: 200, headers: { 'X-Processing-Time': `${duration}ms` } }
    );
  } catch (error: any) {
    const duration = Date.now() - startTime;

    webhookLogger.error('hotelspider_webhook_error', 'HotelSpider webhook error', error, {
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
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/webhooks/hotelspider',
    message: 'HotelSpider webhook endpoint is ready',
    authentication: 'HTTP Basic Auth required',
    contentType: 'application/xml',
    timestamp: new Date().toISOString(),
  });
}
