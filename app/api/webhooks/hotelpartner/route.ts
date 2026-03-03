/**
 * HotelPartner Webhook Endpoint
 *
 * POST /api/webhooks/hotelpartner
 *
 * Receives booking notifications from HotelPartner's B.E. Quick WBE
 * when a reservation with the "Baum pflanzen" extra is created.
 *
 * Supports multiple payload formats:
 *  - Structured reservation event (from HotelPartner backend)
 *  - GTM purchase event (from WBE tracking)
 *  - Simple extra booking event
 *
 * Authentication: X-Webhook-Secret header or Basic Auth
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { HotelPartnerWebhookHandler } from '@/lib/pms/hotelpartner/HotelPartnerWebhookHandler';

export async function POST(request: NextRequest) {
  try {
    const rawPayload = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Extract hotel ID from query params, headers, or payload
    let hotelId = request.nextUrl.searchParams.get('hotelId') || '';
    let treeExtraId: number | undefined;

    if (!hotelId) {
      // Try to extract from payload
      try {
        const payload = JSON.parse(rawPayload);
        hotelId = payload.hotelId?.toString() || payload.hotel?.toString() || '';
      } catch {
        // Payload might not be JSON
      }
    }

    if (!hotelId) {
      return NextResponse.json(
        { error: 'Missing hotelId parameter' },
        { status: 400 }
      );
    }

    // Look up the hotel in our database
    const hotel = await prisma.hotel.findFirst({
      where: {
        pmsType: 'hotelpartner',
        OR: [
          { externalId: hotelId },
          { mewsId: `hotelpartner-${hotelId}` },
        ],
      },
      include: { credentials: true },
    });

    // Use hotel's configured tree extra ID if available
    if (hotel?.credentials?.hotelpartnerExtraId) {
      treeExtraId = parseInt(hotel.credentials.hotelpartnerExtraId, 10);
    }

    const dbHotelId = hotel?.id || hotelId;
    const handler = new HotelPartnerWebhookHandler(dbHotelId, treeExtraId);

    // Validate webhook
    if (!handler.validateWebhook(rawPayload, headers)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Process webhook
    const result = await handler.processWebhook(rawPayload, headers);

    if (!result.success) {
      console.error('HotelPartner webhook processing failed:', result.errors);
      return NextResponse.json(
        { error: 'Processing failed', details: result.errors },
        { status: 500 }
      );
    }

    // Save tree orders to database
    if (result.processedOrders.length > 0 && hotel) {
      for (const order of result.processedOrders) {
        await prisma.treeOrder.upsert({
          where: { mewsId: order.externalId },
          update: {
            quantity: order.quantity,
            amount: order.amount,
            currency: order.currency,
            bookedAt: order.bookedAt,
            checkInAt: order.metadata?.checkin ? new Date(order.metadata.checkin) : undefined,
          },
          create: {
            mewsId: order.externalId,
            hotelId: hotel.id,
            pmsType: 'hotelpartner',
            quantity: order.quantity,
            amount: order.amount,
            currency: order.currency,
            bookedAt: order.bookedAt,
            checkInAt: order.metadata?.checkin ? new Date(order.metadata.checkin) : undefined,
          },
        });
      }

      console.log(
        `HotelPartner webhook: Saved ${result.processedOrders.length} tree orders ` +
        `for hotel ${hotel.name} (${hotelId})`
      );
    }

    return NextResponse.json({
      success: true,
      ordersProcessed: result.processedOrders.length,
      metadata: result.metadata,
    });
  } catch (error: any) {
    console.error('HotelPartner webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for webhook health check
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'hotelpartner-webhook',
    timestamp: new Date().toISOString(),
  });
}
