/**
 * SIHOT Push-Notification Endpoint
 *
 * SIHOT sends AUTOTASK notifications here (Reservation Create/Update/Cancel,
 * Check-In, Service Posting). We:
 *   1. Parse + dispatch via sihot-webhook-handler.
 *   2. On success, call SIHOT's S_NOTIFICATION_CONFIRM with the TASK-OBJID.
 *   3. On failure, call S_NOTIFICATION_ERROR_SET so SIHOT retries per its config.
 *
 * Security: SIHOT doesn't sign push bodies. We harden the endpoint with a shared
 * `?secret=` query param (SIHOT_WEBHOOK_SECRET), plus optional IP allowlisting in
 * the edge config. The secret is shared with SIHOT support at registration time.
 *
 * The response body to SIHOT is minimal — SIHOT itself only cares about the HTTP
 * status. Our ACK flows back via the separate S_NOTIFICATION_CONFIRM call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { processSihotNotification } from '@/lib/sihot-webhook-handler';
import { SihotClient } from '@/lib/sihot';
import { credentialManager } from '@/lib/credential-manager';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Acknowledge a notification back to SIHOT.
 * We try to find a hotel whose credentials let us authenticate, call CONFIRM or ERROR_SET,
 * and swallow transport errors (we don't want to 500 our own endpoint over an ACK hiccup).
 */
async function sendSihotAck(
  hotelId: string | undefined,
  taskObjId: string,
  errorMsg: string | null
): Promise<void> {
  try {
    // Prefer the hotel that produced the event. Fallback: any SIHOT-configured hotel
    // (SIHOT auth is per-product, not per-hotel — any hotel sharing our product works).
    let creds: Awaited<ReturnType<typeof credentialManager.getSihotCredentials>> | null = null;
    if (hotelId) {
      creds = await credentialManager.getSihotCredentials(hotelId).catch(() => null);
    }
    if (!creds) {
      const fallbackHotel = await prisma.hotel.findFirst({
        where: { pmsType: 'sihot' },
        include: { credentials: true },
      });
      if (fallbackHotel) {
        creds = await credentialManager.getSihotCredentials(fallbackHotel.id).catch(() => null);
      }
    }

    if (!creds) {
      console.warn('[sihot-webhook] No SIHOT credentials available — cannot send ACK for', taskObjId);
      return;
    }

    const client = new SihotClient({
      username: creds.username,
      password: creds.password,
      hotelId: creds.hotelId,
      productId: creds.productId,
    });

    if (errorMsg) {
      await client.reportNotificationError(taskObjId, errorMsg);
    } else {
      await client.confirmNotification(taskObjId);
    }
  } catch (err: any) {
    console.error('[sihot-webhook] Failed to send ACK for', taskObjId, err?.message ?? err);
  }
}

export async function POST(request: NextRequest) {
  // --- Auth (shared secret via query string) ---
  const expectedSecret = process.env.SIHOT_WEBHOOK_SECRET;
  const providedSecret = request.nextUrl.searchParams.get('secret');

  if (expectedSecret) {
    if (!providedSecret || providedSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  // If SIHOT_WEBHOOK_SECRET is unset, endpoint is open — acceptable for initial
  // testing, but production deploys should always set it.

  // --- Parse Body ---
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // --- Dispatch ---
  try {
    const result = await processSihotNotification(body);

    // Fire-and-forget ACK to SIHOT (don't block the HTTP response).
    if (result.taskObjId) {
      const errorMsg = result.ok ? null : (result.error ?? 'Processing failed');
      sendSihotAck(result.hotelId, result.taskObjId, errorMsg).catch(() => {});
    }

    if (!result.ok) {
      return NextResponse.json({ success: false, ...result }, { status: 422 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[sihot-webhook] Unhandled error:', error);

    // Best-effort ACK with error so SIHOT retries.
    const taskObjId = body?.AUTOTASK?.['TASK-OBJID'] ?? body?.['TASK-OBJID'];
    if (taskObjId) {
      sendSihotAck(undefined, String(taskObjId), error?.message ?? 'Internal error').catch(() => {});
    }

    // Log the error to the audit table.
    try {
      await prisma.webhookEvent.create({
        data: {
          pmsType: 'sihot',
          eventType: 'sihot-error',
          payload: { body, error: error?.message } as any,
          processed: false,
          error: error?.message ?? 'Unknown error',
        },
      });
    } catch {
      // swallow
    }

    return NextResponse.json(
      { error: error?.message ?? 'Internal server error' },
      { status: 500 }
    );
  }
}

/** Quick liveness probe for SIHOT support to sanity-check the URL. */
export async function GET() {
  return NextResponse.json({
    service: 'click-a-tree SIHOT webhook',
    status: 'ok',
    method: 'POST required',
  });
}
