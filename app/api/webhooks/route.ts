/**
 * Unified Webhook Endpoint
 *
 * Handles webhooks from multiple PMS systems (Mews, HotelSpider)
 * Routes to correct handler based on hotelId parameter
 *
 * URL Format: POST /api/webhooks?hotelId=xxx&secret=yyy
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PmsFactory } from '@/lib/pms/PmsFactory';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const hotelId = searchParams.get('hotelId');
  const secret = searchParams.get('secret');

  // Validate parameters
  if (!hotelId) {
    return NextResponse.json(
      { error: 'Missing hotelId parameter' },
      { status: 400 }
    );
  }

  // Verify webhook secret
  const expectedSecret = process.env.WEBHOOK_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    console.log('Webhook authentication failed: invalid secret');
    return NextResponse.json(
      { error: 'Invalid secret' },
      { status: 401 }
    );
  }

  try {
    // Fetch hotel and determine PMS type
    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
      select: { id: true, pmsType: true, name: true },
    });

    if (!hotel) {
      console.log(`Webhook error: Hotel not found: ${hotelId}`);
      return NextResponse.json(
        { error: 'Hotel not found' },
        { status: 404 }
      );
    }

    console.log(`Processing webhook for hotel: ${hotel.name} (${hotel.pmsType})`);

    // Get raw payload and headers
    const rawPayload = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Create PMS-specific webhook handler
    const handler = PmsFactory.createWebhookHandler(hotel.id, hotel.pmsType);

    // Validate webhook authenticity
    if (!handler.validateWebhook(rawPayload, headers)) {
      console.log('Webhook validation failed');
      return NextResponse.json(
        { error: 'Webhook validation failed' },
        { status: 401 }
      );
    }

    // Process webhook
    const result = await handler.processWebhook(rawPayload, headers);

    if (!result.success) {
      console.error('Webhook processing failed:', result.errors);

      // Log failed webhook event
      await prisma.webhookEvent.create({
        data: {
          pmsType: hotel.pmsType,
          hotelId: hotel.id,
          eventType: 'webhook_error',
          payload: { error: result.errors },
          processed: false,
          error: result.errors?.join(', '),
        },
      });

      // Return appropriate error format based on PMS type
      if (hotel.pmsType === 'hotelspider') {
        // HotelSpider expects OTA error format
        const timestamp = new Date().toISOString();
        const errorMessage = result.errors?.join(', ') || 'Processing failed';
        const xmlError = `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelResNotifRS xmlns="http://www.opentravel.org/OTA/2003/05" TimeStamp="${timestamp}" Version="1.0">
  <Errors>
    <Error Type="3" Code="450">${errorMessage}</Error>
  </Errors>
</OTA_HotelResNotifRS>`;

        return new NextResponse(xmlError, {
          status: 200, // OTA spec: return 200 even for errors, error is in XML
          headers: {
            'Content-Type': 'application/xml',
          },
        });
      }

      return NextResponse.json(
        { error: 'Processing failed', details: result.errors },
        { status: 500 }
      );
    }

    console.log(`Processed ${result.processedOrders.length} orders from webhook`);

    // Save orders to database
    for (const orderData of result.processedOrders) {
      // Prefix external ID with PMS type to avoid collisions
      const prefixedId = `${hotel.pmsType}-${orderData.externalId}`;

      await prisma.treeOrder.upsert({
        where: { mewsId: prefixedId },
        create: {
          mewsId: prefixedId,
          hotelId: hotel.id,
          pmsType: hotel.pmsType,
          quantity: orderData.quantity,
          amount: orderData.amount,
          currency: orderData.currency,
          bookedAt: orderData.bookedAt,
        },
        update: {
          quantity: orderData.quantity,
          amount: orderData.amount,
          currency: orderData.currency,
        },
      });
    }

    // Log successful webhook event
    const eventId = result.metadata?.eventId || null;
    await prisma.webhookEvent.create({
      data: {
        pmsType: hotel.pmsType,
        hotelId: hotel.id,
        eventType: 'webhook_processed',
        eventId: eventId,
        payload: result.metadata || {},
        processed: true,
        processedAt: new Date(),
      },
    });

    // Return appropriate response format based on PMS type
    if (hotel.pmsType === 'hotelspider') {
      // HotelSpider expects OTA_HotelResNotifRS XML response
      const timestamp = new Date().toISOString();
      const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<OTA_HotelResNotifRS xmlns="http://www.opentravel.org/OTA/2003/05" TimeStamp="${timestamp}" Version="1.0">
  <Success/>
  <HotelReservations>
    <HotelReservation ResStatus="Book" CreateDateTime="${timestamp}" LastModifyDateTime="${timestamp}">
      <UniqueID Type="14" ID="${eventId || 'processed'}"/>
    </HotelReservation>
  </HotelReservations>
</OTA_HotelResNotifRS>`;

      return new NextResponse(xmlResponse, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml',
        },
      });
    }

    // For other PMS types (e.g., Mews), return JSON
    return NextResponse.json({
      success: true,
      ordersProcessed: result.processedOrders.length,
      hotel: hotel.name,
      pmsType: hotel.pmsType,
    });

  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
