/**
 * Hotel-Specific Stats API
 *
 * GET /api/hotels/[hotelId]/stats
 * Returns statistics for a specific hotel
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hotelId: string }> }
) {
  try {
    const { hotelId } = await params;

    // Fetch hotel
    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
    });

    if (!hotel) {
      return NextResponse.json({ error: 'Hotel not found' }, { status: 404 });
    }

    // Fetch recent orders (raw data) - sorted by bookedAt ascending (earliest first)
    const recentOrdersRaw = await prisma.treeOrder.findMany({
      where: { hotelId },
      orderBy: { bookedAt: 'asc' },
      take: 100, // Increased limit for filtering
    });

    // Calculate total revenue (sum of all amounts for non-canceled orders)
    const totals = await prisma.treeOrder.aggregate({
      where: {
        hotelId,
        amount: { gt: 0 }, // Only count non-canceled orders
      },
      _sum: {
        amount: true,
      },
    });

    // MEWS-specific calculation: Trees based on revenue (5.90$ per tree)
    // Because Mews sends "1 item" for a package of trees
    const totalRevenue = totals._sum.amount || 0;
    const totalTrees = Math.round(totalRevenue / 5.9);

    // Recalculate quantity for each order based on amount
    const recentOrders = recentOrdersRaw.map(order => ({
      ...order,
      quantity: Math.round((order.amount || 0) / 5.9) || order.quantity
    }));

    // Fetch invoices
    const invoices = await prisma.invoice.findMany({
      where: { hotelId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      hotel: {
        id: hotel.id,
        name: hotel.name,
        pmsType: hotel.pmsType,
        externalId: hotel.externalId,
      },
      totalTrees,
      totalRevenue,
      currency: recentOrders[0]?.currency || 'EUR',
      recentOrders,
      invoices,
    });
  } catch (error: any) {
    console.error('Error fetching hotel stats:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
