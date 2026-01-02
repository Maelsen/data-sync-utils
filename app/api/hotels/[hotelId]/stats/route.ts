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

    // Fetch recent orders
    const recentOrders = await prisma.treeOrder.findMany({
      where: { hotelId },
      orderBy: { bookedAt: 'desc' },
      take: 20,
    });

    // Calculate total trees and revenue
    const totals = await prisma.treeOrder.aggregate({
      where: {
        hotelId,
        amount: { gt: 0 }, // Only count non-canceled orders
      },
      _sum: {
        quantity: true,
        amount: true,
      },
    });

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
      totalTrees: totals._sum.quantity || 0,
      totalRevenue: totals._sum.amount || 0,
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
