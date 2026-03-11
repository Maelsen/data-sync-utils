/**
 * Generic Incoming Webhook Endpoint
 *
 * Accepts standardized tree order events from any external PMS system.
 * PMS developers send HTTP POST requests here with order data.
 *
 * POST /api/webhooks/incoming
 *
 * Headers:
 *   Authorization: Bearer {API_KEY}
 *   X-PMS-Name: {pmsSystemName}  (e.g. "protel", "opera", "apaleo")
 *   Content-Type: application/json
 *
 * Events: order.created, order.updated, order.canceled, checkin.confirmed
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * Hash an API key using SHA-256 (same as admin endpoint)
 */
function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// Valid event types
const VALID_EVENTS = ['order.created', 'order.updated', 'order.canceled', 'checkin.confirmed'] as const;
type EventType = typeof VALID_EVENTS[number];

// Valid order statuses
const VALID_STATUSES = ['active', 'modified', 'canceled'] as const;

// ISO 4217 currency code pattern (3 uppercase letters)
const CURRENCY_REGEX = /^[A-Z]{3}$/;

// ISO 8601 datetime pattern
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;

interface IncomingWebhookPayload {
  event: EventType;
  hotelId: string;
  hotelName: string;
  timestamp: string;
  order: {
    orderId: string;
    reservationId?: string;
    productName?: string;
    productId?: string;
    quantity?: number;
    unitPrice?: number;
    totalAmount?: number;
    currency?: string;
    bookedAt?: string;
    scheduledCheckIn?: string;
    actualCheckIn?: string | null;
    orderStatus?: string;
    canceledAt?: string | null;
  };
}

/**
 * Validate the full payload for order.created and order.updated events
 */
function validateFullOrderPayload(order: IncomingWebhookPayload['order']): string[] {
  const errors: string[] = [];

  if (!order.orderId) errors.push('order.orderId is required');
  if (!order.reservationId) errors.push('order.reservationId is required');
  if (!order.productName) errors.push('order.productName is required');
  if (typeof order.productName === 'object') errors.push('order.productName must be a plain string, not a localized object');

  if (order.quantity == null || order.quantity < 1) errors.push('order.quantity must be >= 1');
  if (order.unitPrice == null || order.unitPrice <= 0) errors.push('order.unitPrice must be > 0');
  if (order.totalAmount == null || order.totalAmount < 0) errors.push('order.totalAmount must be >= 0');

  if (!order.currency) {
    errors.push('order.currency is required');
  } else if (!CURRENCY_REGEX.test(order.currency)) {
    errors.push('order.currency must be a valid ISO 4217 code (e.g. EUR, USD, CHF)');
  }

  if (!order.bookedAt) {
    errors.push('order.bookedAt is required');
  } else if (!ISO_DATE_REGEX.test(order.bookedAt)) {
    errors.push('order.bookedAt must be ISO 8601 format (e.g. 2026-03-15T14:00:00Z)');
  }

  if (!order.scheduledCheckIn) {
    errors.push('order.scheduledCheckIn is required');
  } else if (!ISO_DATE_REGEX.test(order.scheduledCheckIn)) {
    errors.push('order.scheduledCheckIn must be ISO 8601 format');
  }

  if (!order.orderStatus) {
    errors.push('order.orderStatus is required');
  } else if (!VALID_STATUSES.includes(order.orderStatus as any)) {
    errors.push(`order.orderStatus must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  return errors;
}

/**
 * Validate check-in confirmation payload (minimal fields required)
 */
function validateCheckInPayload(order: IncomingWebhookPayload['order']): string[] {
  const errors: string[] = [];

  if (!order.orderId) errors.push('order.orderId is required');
  if (!order.actualCheckIn) errors.push('order.actualCheckIn is required for checkin.confirmed events');
  if (order.actualCheckIn && !ISO_DATE_REGEX.test(order.actualCheckIn)) {
    errors.push('order.actualCheckIn must be ISO 8601 format');
  }

  return errors;
}

/**
 * Validate cancellation payload
 */
function validateCancelPayload(order: IncomingWebhookPayload['order']): string[] {
  const errors: string[] = [];

  if (!order.orderId) errors.push('order.orderId is required');
  if (order.orderStatus !== 'canceled') errors.push('order.orderStatus must be "canceled" for order.canceled events');
  if (!order.canceledAt) errors.push('order.canceledAt is required for order.canceled events');

  return errors;
}

export async function POST(request: NextRequest) {
  // --- Authentication (DB-based per-PMS API keys) ---
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or invalid Authorization header. Expected: Bearer {API_KEY}' },
      { status: 401 }
    );
  }

  const providedKey = authHeader.slice(7); // Remove "Bearer "
  const keyHash = hashKey(providedKey);

  // Look up the key in the database
  const apiKeyRecord = await prisma.apiKey.findUnique({
    where: { keyHash },
  });

  if (!apiKeyRecord) {
    return NextResponse.json(
      { error: 'Invalid API key' },
      { status: 401 }
    );
  }

  if (!apiKeyRecord.active) {
    return NextResponse.json(
      { error: 'API key has been deactivated. Contact marlin@clickatree.com' },
      { status: 403 }
    );
  }

  // Update last used timestamp (fire-and-forget, don't block the response)
  prisma.apiKey.update({
    where: { id: apiKeyRecord.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {}); // Ignore errors on this non-critical update

  // PMS name comes from the API key record (trusted source)
  // But X-PMS-Name header can override for multi-brand PMS companies
  const pmsName = (request.headers.get('x-pms-name')?.toLowerCase().trim()) || apiKeyRecord.pmsName;
  if (!pmsName) {
    return NextResponse.json(
      { error: 'Missing X-PMS-Name header. Provide the name of your PMS system.' },
      { status: 400 }
    );
  }

  // --- Parse Body ---
  let payload: IncomingWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  // --- Validate Envelope ---
  if (!payload.event || !VALID_EVENTS.includes(payload.event as EventType)) {
    return NextResponse.json(
      { error: `Invalid event type. Must be one of: ${VALID_EVENTS.join(', ')}` },
      { status: 400 }
    );
  }

  if (!payload.hotelId) {
    return NextResponse.json({ error: 'hotelId is required' }, { status: 400 });
  }

  if (!payload.hotelName) {
    return NextResponse.json({ error: 'hotelName is required' }, { status: 400 });
  }

  if (!payload.order) {
    return NextResponse.json({ error: 'order object is required' }, { status: 400 });
  }

  // --- Validate Order Data (event-specific) ---
  let validationErrors: string[] = [];

  switch (payload.event) {
    case 'order.created':
    case 'order.updated':
      validationErrors = validateFullOrderPayload(payload.order);
      break;
    case 'order.canceled':
      validationErrors = validateCancelPayload(payload.order);
      break;
    case 'checkin.confirmed':
      validationErrors = validateCheckInPayload(payload.order);
      break;
  }

  if (validationErrors.length > 0) {
    return NextResponse.json(
      { error: 'Validation failed', details: validationErrors },
      { status: 400 }
    );
  }

  try {
    // --- Find or Create Hotel ---
    const externalHotelId = `${pmsName}-${payload.hotelId}`;

    let hotel = await prisma.hotel.findFirst({
      where: {
        pmsType: 'generic',
        externalId: externalHotelId,
      },
    });

    if (!hotel) {
      // Auto-create hotel on first webhook
      hotel = await prisma.hotel.create({
        data: {
          name: payload.hotelName,
          pmsType: 'generic',
          externalId: externalHotelId,
          mewsId: `generic-${externalHotelId}`, // Required unique field
        },
      });
      console.log(`Auto-created hotel: ${hotel.name} (${externalHotelId})`);
    }

    // --- Process Event ---
    const prefixedOrderId = `generic-${pmsName}-${payload.order.orderId}`;
    const { order } = payload;

    switch (payload.event) {
      case 'order.created':
      case 'order.updated': {
        await prisma.treeOrder.upsert({
          where: { mewsId: prefixedOrderId },
          create: {
            mewsId: prefixedOrderId,
            hotelId: hotel.id,
            pmsType: 'generic',
            quantity: order.quantity!,
            amount: order.totalAmount!,
            currency: order.currency!,
            bookedAt: new Date(order.bookedAt!),
            checkInAt: order.scheduledCheckIn ? new Date(order.scheduledCheckIn) : null,
            actualCheckInAt: order.actualCheckIn ? new Date(order.actualCheckIn) : null,
          },
          update: {
            quantity: order.quantity!,
            amount: order.totalAmount!,
            currency: order.currency!,
            checkInAt: order.scheduledCheckIn ? new Date(order.scheduledCheckIn) : undefined,
            actualCheckInAt: order.actualCheckIn ? new Date(order.actualCheckIn) : undefined,
          },
        });
        break;
      }

      case 'order.canceled': {
        // Find the existing order
        const existingOrder = await prisma.treeOrder.findUnique({
          where: { mewsId: prefixedOrderId },
        });

        if (existingOrder) {
          // Set amount to 0 to mark as canceled (consistent with existing dashboard logic)
          await prisma.treeOrder.update({
            where: { mewsId: prefixedOrderId },
            data: { amount: 0 },
          });
        }
        // If order doesn't exist, cancellation is a no-op (idempotent)
        break;
      }

      case 'checkin.confirmed': {
        const existingOrder = await prisma.treeOrder.findUnique({
          where: { mewsId: prefixedOrderId },
        });

        if (!existingOrder) {
          return NextResponse.json(
            { error: `Order not found: ${order.orderId}. Send order.created before checkin.confirmed.` },
            { status: 404 }
          );
        }

        await prisma.treeOrder.update({
          where: { mewsId: prefixedOrderId },
          data: {
            actualCheckInAt: new Date(order.actualCheckIn!),
          },
        });
        break;
      }
    }

    // --- Log Webhook Event ---
    await prisma.webhookEvent.create({
      data: {
        pmsType: 'generic',
        hotelId: hotel.id,
        eventType: payload.event,
        eventId: `${pmsName}-${payload.order.orderId}-${payload.event}-${Date.now()}`,
        payload: payload as any,
        processed: true,
        processedAt: new Date(),
      },
    });

    console.log(`[incoming-webhook] ${payload.event} from ${pmsName} for hotel ${hotel.name}: order ${order.orderId}`);

    return NextResponse.json({
      success: true,
      event: payload.event,
      orderId: order.orderId,
      hotel: hotel.name,
      pmsName,
    });

  } catch (error: any) {
    console.error('[incoming-webhook] Error:', error);

    // Log failed event
    try {
      await prisma.webhookEvent.create({
        data: {
          pmsType: 'generic',
          eventType: `${payload.event}_error`,
          payload: { ...payload, error: error.message } as any,
          processed: false,
          error: error.message,
        },
      });
    } catch (logError) {
      console.error('[incoming-webhook] Failed to log error event:', logError);
    }

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
