/**
 * SIHOT Webhook Handler
 *
 * SIHOT pushes notifications to us wrapped in an AUTOTASK envelope. We:
 *   1. Extract TASK-OBJID (required for ACK).
 *   2. Route by notification type (S_RESERVATION_COMPLETE_PUSH, S_RESERVATION_DELETED_PUSH,
 *      S_CI_ROOM_PUSH, S_SERVICE_POSTING_COMPLETE_PUSH).
 *   3. Filter on our ProductID — only events touching the tree-upsell service become TreeOrders.
 *   4. Upsert TreeOrder, log to WebhookEvent, return ACK info.
 *
 * The caller (route.ts) is responsible for the HTTP ACK back to SIHOT
 * (S_NOTIFICATION_CONFIRM / S_NOTIFICATION_ERROR_SET).
 *
 * Payload shape is intentionally parsed defensively. SIHOT payloads vary by message
 * type and hotel configuration; we extract the fields we need and stash the full raw
 * payload in WebhookEvent for post-hoc debugging.
 */

import { prisma } from './prisma';
import { PmsType } from '@prisma/client';

export interface SihotHandlerResult {
  ok: boolean;
  taskObjId: string | null;
  notificationType: string | null;
  error?: string;
  hotelId?: string;
  orderId?: string;
  action?: 'upsert' | 'cancel' | 'checkin' | 'skipped' | 'logged-only';
  reason?: string;
}

/** Extract a field from a SIHOT payload supporting both camelCase and SHOUTING-SNAKE variants. */
function pick(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

/** Pull TASK-OBJID out of whatever envelope SIHOT sent (AUTOTASK / NOTIFICATION / top-level). */
function extractTaskObjId(body: any): string | null {
  const candidates = [
    body?.AUTOTASK?.['TASK-OBJID'],
    body?.AUTOTASK?.TASKOBJID,
    body?.NOTIFICATION?.['TASK-OBJID'],
    body?.['TASK-OBJID'],
    body?.TASKOBJID,
  ];
  for (const c of candidates) {
    if (c !== undefined && c !== null && c !== '') return String(c);
  }
  return null;
}

/** Pull the notification type id (e.g. "S_RESERVATION_COMPLETE_PUSH"). */
function extractNotificationType(body: any): string | null {
  const candidates = [
    body?.AUTOTASK?.notificationid,
    body?.AUTOTASK?.NOTIFICATIONID,
    body?.notificationid,
    body?.NOTIFICATIONID,
    body?.NOTIFICATION?.notificationid,
    body?.NOTIFICATION?.NOTIFICATIONID,
  ];
  for (const c of candidates) {
    if (c) return String(c);
  }
  return null;
}

/** Get the reservation object regardless of nesting. */
function extractReservation(body: any): any {
  return (
    body?.AUTOTASK?.RESERVATION ||
    body?.RESERVATION ||
    body?.AUTOTASK?.reservation ||
    body?.reservation ||
    null
  );
}

/** Extract SIHOT hotel number from payload (usually in RESERVATION.hotel or top-level HOTEL). */
function extractSihotHotelId(body: any, reservation: any): string | null {
  const candidates = [
    pick(reservation, 'hotel', 'HOTEL', 'HotelNumber', 'hotelNumber'),
    pick(body?.AUTOTASK, 'hotel', 'HOTEL'),
    pick(body, 'hotel', 'HOTEL'),
  ];
  for (const c of candidates) {
    if (c !== undefined && c !== null && c !== '') return String(c);
  }
  return null;
}

/**
 * SIHOT payloads list services inside SERVICE (array or object).
 * We look for entries whose PRODUCT-OBJID / PRODUCT-ID matches the hotel's tree ProductID.
 */
function extractTreeServices(reservation: any, productId: string): any[] {
  const services = reservation?.SERVICE ?? reservation?.services ?? [];
  const list = Array.isArray(services) ? services : [services];
  return list.filter((s: any) => {
    const pid = pick(s, 'PRODUCT-OBJID', 'PRODUCT-ID', 'productId', 'productObjId', 'ProductID');
    return pid && String(pid) === productId;
  });
}

/** Sum quantity across matched services. */
function sumQty(services: any[]): number {
  return services.reduce((acc, s) => {
    const q = Number(pick(s, 'QTY', 'quantity', 'Qty')) || 1;
    return acc + q;
  }, 0);
}

/** Sum total amount across matched services. */
function sumAmount(services: any[]): number {
  return services.reduce((acc, s) => {
    const total = Number(
      pick(s, 'TOTAL-PRICE', 'TotalPrice', 'totalPrice', 'AMOUNT', 'Amount')
    );
    const unit = Number(pick(s, 'PRICE', 'Price', 'price', 'UnitPrice'));
    const qty = Number(pick(s, 'QTY', 'quantity', 'Qty')) || 1;
    const line = !isNaN(total) && total > 0 ? total : (!isNaN(unit) ? unit * qty : 0);
    return acc + line;
  }, 0);
}

function firstCurrency(services: any[]): string {
  for (const s of services) {
    const c = pick(s, 'CURRENCY', 'currency', 'Currency');
    if (c) return String(c);
  }
  return 'EUR';
}

function parseDate(raw: any): Date | null {
  if (!raw) return null;
  const d = new Date(String(raw));
  return isNaN(d.getTime()) ? null : d;
}

/** Find the Click A Tree Hotel record that owns this SIHOT hotel number. */
async function resolveHotel(sihotHotelId: string) {
  // Preferred: explicit externalId match.
  let hotel = await prisma.hotel.findFirst({
    where: { pmsType: 'sihot' as PmsType, externalId: sihotHotelId },
  });

  if (hotel) return hotel;

  // Fallback: look up via HotelCredentials.sihotHotelId.
  const creds = await prisma.hotelCredentials.findFirst({
    where: { sihotHotelId },
    include: { hotel: true },
  });

  return creds?.hotel ?? null;
}

/**
 * Main entrypoint — dispatches on notification type.
 * Throws on hard failures so the caller sends NOTIFICATION_ERROR and SIHOT retries.
 */
export async function processSihotNotification(rawBody: any): Promise<SihotHandlerResult> {
  const taskObjId = extractTaskObjId(rawBody);
  const notificationType = extractNotificationType(rawBody);

  // Always log raw payload first (audit trail), regardless of whether we can process it.
  const logEvent = async (
    processed: boolean,
    extra: { hotelId?: string | null; error?: string | null } = {}
  ) => {
    try {
      await prisma.webhookEvent.create({
        data: {
          pmsType: 'sihot' as PmsType,
          eventType: notificationType ?? 'sihot-unknown',
          eventId: taskObjId ? `sihot-${taskObjId}` : null,
          hotelId: extra.hotelId ?? null,
          payload: rawBody as any,
          processed,
          processedAt: processed ? new Date() : null,
          error: extra.error ?? null,
        },
      });
    } catch (err) {
      // Dedup collision on eventId is expected on SIHOT retries — not fatal.
      console.warn('[sihot] Could not persist WebhookEvent:', err);
    }
  };

  if (!taskObjId) {
    await logEvent(false, { error: 'Missing TASK-OBJID' });
    return {
      ok: false,
      taskObjId: null,
      notificationType,
      error: 'Missing TASK-OBJID in payload',
    };
  }

  const reservation = extractReservation(rawBody);
  const sihotHotelId = reservation ? extractSihotHotelId(rawBody, reservation) : null;

  if (!sihotHotelId) {
    await logEvent(true, { error: 'No hotel identifier — notification acknowledged without processing' });
    return {
      ok: true,
      taskObjId,
      notificationType,
      action: 'logged-only',
      reason: 'No hotel identifier in payload',
    };
  }

  const hotel = await resolveHotel(sihotHotelId);
  if (!hotel) {
    await logEvent(true, { error: `Unknown SIHOT hotel id ${sihotHotelId}` });
    return {
      ok: true,
      taskObjId,
      notificationType,
      action: 'logged-only',
      reason: `No Click A Tree hotel matches SIHOT hotelId ${sihotHotelId}`,
    };
  }

  // Pull per-hotel ProductID to filter services.
  const creds = await prisma.hotelCredentials.findUnique({ where: { hotelId: hotel.id } });
  const productId = creds?.sihotProductId ?? null;

  if (!productId) {
    await logEvent(true, { hotelId: hotel.id, error: 'Hotel missing sihotProductId' });
    return {
      ok: true,
      taskObjId,
      notificationType,
      hotelId: hotel.id,
      action: 'logged-only',
      reason: 'Hotel has no sihotProductId configured — cannot identify tree services',
    };
  }

  const reservationObjId = pick(
    reservation,
    'RESERVATION-OBJID',
    'ReservationObjId',
    'reservationObjId',
    'OBJID'
  );

  if (!reservationObjId) {
    await logEvent(false, { hotelId: hotel.id, error: 'Missing RESERVATION-OBJID' });
    return {
      ok: false,
      taskObjId,
      notificationType,
      hotelId: hotel.id,
      error: 'Missing RESERVATION-OBJID in payload',
    };
  }

  const prefixedOrderId = `sihot-${hotel.id}-${reservationObjId}`;
  const bookedAt = parseDate(pick(reservation, 'RES-DATE', 'ResDate', 'resDate', 'bookedAt')) ?? new Date();
  const scheduledCheckIn = parseDate(pick(reservation, 'ARR', 'Arrival', 'arrivalDate', 'ARR-DATE'));
  const actualCheckIn = parseDate(pick(reservation, 'ACT-ARR', 'ActualArrival', 'actualArrival', 'ACTARR'));

  // Dispatch by notification type. Unknown types → logged-only + ACK (so SIHOT doesn't retry forever).
  switch (notificationType) {
    case 'S_RESERVATION_COMPLETE_PUSH':
    case 'S_RESERVATION_UPDATE_PUSH': {
      const treeServices = extractTreeServices(reservation, productId);
      if (treeServices.length === 0) {
        await logEvent(true, { hotelId: hotel.id });
        return {
          ok: true,
          taskObjId,
          notificationType,
          hotelId: hotel.id,
          action: 'skipped',
          reason: 'No tree-product services in reservation',
        };
      }

      const qty = sumQty(treeServices);
      const amount = sumAmount(treeServices);
      const currency = firstCurrency(treeServices);

      await prisma.treeOrder.upsert({
        where: { mewsId: prefixedOrderId },
        create: {
          mewsId: prefixedOrderId,
          hotelId: hotel.id,
          pmsType: 'sihot' as PmsType,
          quantity: qty,
          amount,
          currency,
          bookedAt,
          checkInAt: scheduledCheckIn,
          actualCheckInAt: actualCheckIn,
        },
        update: {
          quantity: qty,
          amount,
          currency,
          checkInAt: scheduledCheckIn ?? undefined,
          actualCheckInAt: actualCheckIn ?? undefined,
        },
      });

      await logEvent(true, { hotelId: hotel.id });
      return {
        ok: true,
        taskObjId,
        notificationType,
        hotelId: hotel.id,
        orderId: prefixedOrderId,
        action: 'upsert',
      };
    }

    case 'S_RESERVATION_DELETED_PUSH':
    case 'S_RESERVATION_CANCEL_PUSH': {
      const existing = await prisma.treeOrder.findUnique({ where: { mewsId: prefixedOrderId } });
      if (existing) {
        await prisma.treeOrder.update({
          where: { mewsId: prefixedOrderId },
          data: { amount: 0 },
        });
      }
      await logEvent(true, { hotelId: hotel.id });
      return {
        ok: true,
        taskObjId,
        notificationType,
        hotelId: hotel.id,
        orderId: prefixedOrderId,
        action: 'cancel',
      };
    }

    case 'S_CI_ROOM_PUSH':
    case 'S_CHECKIN_PUSH': {
      const existing = await prisma.treeOrder.findUnique({ where: { mewsId: prefixedOrderId } });
      if (!existing) {
        // Check-in without a known order is valid (no tree booked) — ACK & move on.
        await logEvent(true, { hotelId: hotel.id });
        return {
          ok: true,
          taskObjId,
          notificationType,
          hotelId: hotel.id,
          action: 'skipped',
          reason: 'Check-in for reservation without tree order',
        };
      }
      await prisma.treeOrder.update({
        where: { mewsId: prefixedOrderId },
        data: { actualCheckInAt: actualCheckIn ?? new Date() },
      });
      await logEvent(true, { hotelId: hotel.id });
      return {
        ok: true,
        taskObjId,
        notificationType,
        hotelId: hotel.id,
        orderId: prefixedOrderId,
        action: 'checkin',
      };
    }

    case 'S_SERVICE_POSTING_COMPLETE_PUSH': {
      // Service-level posting — only relevant if the posted service matches our productId.
      const services = Array.isArray(reservation?.SERVICE) ? reservation.SERVICE : [reservation?.SERVICE].filter(Boolean);
      const treeServices = services.filter((s: any) => {
        const pid = pick(s, 'PRODUCT-OBJID', 'PRODUCT-ID');
        return pid && String(pid) === productId;
      });

      if (treeServices.length === 0) {
        await logEvent(true, { hotelId: hotel.id });
        return {
          ok: true,
          taskObjId,
          notificationType,
          hotelId: hotel.id,
          action: 'skipped',
          reason: 'Service posting for non-tree product',
        };
      }

      const qty = sumQty(treeServices);
      const amount = sumAmount(treeServices);
      const currency = firstCurrency(treeServices);

      await prisma.treeOrder.upsert({
        where: { mewsId: prefixedOrderId },
        create: {
          mewsId: prefixedOrderId,
          hotelId: hotel.id,
          pmsType: 'sihot' as PmsType,
          quantity: qty,
          amount,
          currency,
          bookedAt,
          checkInAt: scheduledCheckIn,
          actualCheckInAt: actualCheckIn,
        },
        update: {
          quantity: qty,
          amount,
          currency,
        },
      });

      await logEvent(true, { hotelId: hotel.id });
      return {
        ok: true,
        taskObjId,
        notificationType,
        hotelId: hotel.id,
        orderId: prefixedOrderId,
        action: 'upsert',
      };
    }

    default: {
      // Unknown notification type — ACK so SIHOT stops retrying, but flag for us to review.
      await logEvent(true, { hotelId: hotel.id, error: `Unhandled notification type ${notificationType ?? '(none)'}` });
      return {
        ok: true,
        taskObjId,
        notificationType,
        hotelId: hotel.id,
        action: 'logged-only',
        reason: `Unhandled notification type ${notificationType ?? '(none)'}`,
      };
    }
  }
}
