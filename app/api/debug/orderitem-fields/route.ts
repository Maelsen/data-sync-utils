import { NextResponse } from 'next/server';
import { MewsClient } from '@/lib/mews';
import { subDays } from 'date-fns';

/**
 * DEBUG: Shows what fields are available in OrderItems
 * Specifically looking for ServiceOrderId to link to reservations
 */

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';

export async function GET() {
  try {
    const mews = new MewsClient({
      clientToken: CLIENT_TOKEN,
      accessToken: ACCESS_TOKEN,
      clientName: 'Click A Tree Debug 1.0.0',
    });

    // Get recent order items
    const endDate = new Date();
    const startDate = subDays(endDate, 30);
    const updatedUtc = {
      StartUtc: startDate.toISOString(),
      EndUtc: endDate.toISOString(),
    };

    const data = await mews.getOrderItems([], updatedUtc);
    const orderItems = data.OrderItems || [];

    // Find tree product orders
    const treeOrders = orderItems.filter((oi: any) =>
      oi.Type === 'ProductOrder' &&
      oi.Data?.Product?.ProductId === 'ff7f1d18-eb3a-47d2-a723-b3a2013d3ce0'
    );

    // Show first 3 with all their fields
    const samples = treeOrders.slice(0, 3).map((oi: any) => ({
      id: oi.Id,
      type: oi.Type,
      // Check all possible reservation-link fields
      serviceOrderId: oi.ServiceOrderId || '(missing)',
      accountId: oi.AccountId || '(missing)',
      reservationId: oi.ReservationId || '(missing)',
      // Show all top-level keys
      allKeys: Object.keys(oi),
      // Show the raw object for debugging
      raw: oi
    }));

    return NextResponse.json({
      success: true,
      totalOrderItems: orderItems.length,
      treeOrdersFound: treeOrders.length,
      samples,
      // Also show unique ServiceOrderIds we found
      uniqueServiceOrderIds: [...new Set(treeOrders.map((oi: any) => oi.ServiceOrderId).filter(Boolean))]
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
