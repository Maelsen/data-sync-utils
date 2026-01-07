import { NextResponse } from 'next/server';
import { MewsClient } from '@/lib/mews';

/**
 * DEBUG: Tests reservation lookup to get check-in dates
 *
 * This endpoint fetches a specific reservation by ID and shows
 * the ScheduledStartUtc field which should be the check-in date.
 */

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // Use a known ServiceOrderId from the orderitem-fields debug endpoint
    const reservationId = searchParams.get('id') || '04de7bda-4c8e-44ea-9217-b3cb00c07825';

    const mews = new MewsClient({
      clientToken: CLIENT_TOKEN,
      accessToken: ACCESS_TOKEN,
      clientName: 'Click A Tree Debug 1.0.0',
    });

    console.log(`[test-reservation] Looking up reservation: ${reservationId}`);

    // Call getReservationsByIds with the ServiceOrderId
    const data = await mews.getReservationsByIds([reservationId]);
    const reservations = data.Reservations || [];

    console.log(`[test-reservation] Got ${reservations.length} reservations`);

    if (reservations.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No reservations found for this ID',
        reservationId,
        rawResponse: data
      });
    }

    const reservation = reservations[0];

    return NextResponse.json({
      success: true,
      reservationId,
      // Key fields for check-in date
      scheduledStartUtc: reservation.ScheduledStartUtc || '(missing)',
      actualStartUtc: reservation.ActualStartUtc || '(missing)',
      startUtc: reservation.StartUtc || '(missing)', // deprecated but fallback
      // Other useful fields
      state: reservation.State,
      number: reservation.Number,
      // Full reservation for debugging
      fullReservation: reservation
    });

  } catch (error: any) {
    console.error('[test-reservation] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    }, { status: 500 });
  }
}
