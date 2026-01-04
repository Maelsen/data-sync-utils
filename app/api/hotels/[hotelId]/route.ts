/**
 * Hotel Management API - Individual Hotel Operations
 *
 * DELETE /api/hotels/[hotelId] - Delete a hotel and all associated data
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/hotels/[hotelId]
 * Delete a hotel and all associated data (credentials, orders, invoices, webhooks)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ hotelId: string }> }
) {
  try {
    const { hotelId } = await params;

    // Check if hotel exists
    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
    });

    if (!hotel) {
      return NextResponse.json({ error: 'Hotel not found' }, { status: 404 });
    }

    // Delete hotel and all associated data in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete credentials
      await tx.hotelCredentials.deleteMany({
        where: { hotelId },
      });

      // Delete tree orders
      await tx.treeOrder.deleteMany({
        where: { hotelId },
      });

      // Delete invoices
      await tx.invoice.deleteMany({
        where: { hotelId },
      });

      // Delete webhook events
      await tx.webhookEvent.deleteMany({
        where: { hotelId },
      });

      // Finally, delete the hotel
      await tx.hotel.delete({
        where: { id: hotelId },
      });
    });

    return NextResponse.json({
      success: true,
      message: `Hotel "${hotel.name}" deleted successfully`,
    });
  } catch (error: any) {
    console.error('Error deleting hotel:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete hotel' },
      { status: 500 }
    );
  }
}
