/**
 * Hotel Management API - Individual Hotel Operations
 *
 * PATCH  /api/hotels/[hotelId] - Update hotel name and/or credentials
 * DELETE /api/hotels/[hotelId] - Delete a hotel and all associated data
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/hotels/[hotelId]
 * Update hotel name and/or credentials
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ hotelId: string }> }
) {
  try {
    const { hotelId } = await params;
    const body = await request.json();

    // Check if hotel exists
    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
      include: { credentials: true },
    });

    if (!hotel) {
      return NextResponse.json({ error: 'Hotel not found' }, { status: 404 });
    }

    // Update hotel name if provided
    if (body.name) {
      await prisma.hotel.update({
        where: { id: hotelId },
        data: { name: body.name },
      });
    }

    // Update credentials if any are provided
    const credentialUpdates: any = {};

    if (hotel.pmsType === 'mews') {
      if (body.mewsClientToken) {
        credentialUpdates.mewsClientToken = encrypt(body.mewsClientToken);
      }
      if (body.mewsAccessToken) {
        credentialUpdates.mewsAccessToken = encrypt(body.mewsAccessToken);
      }
    } else if (hotel.pmsType === 'hotelspider') {
      if (body.hotelspiderUsername) {
        credentialUpdates.hotelspiderUsername = encrypt(body.hotelspiderUsername);
      }
      if (body.hotelspiderPassword) {
        credentialUpdates.hotelspiderPassword = encrypt(body.hotelspiderPassword);
      }
      if (body.hotelspiderHotelCode) {
        credentialUpdates.hotelspiderHotelCode = body.hotelspiderHotelCode;
        // Also update hotel externalId
        await prisma.hotel.update({
          where: { id: hotelId },
          data: { externalId: body.hotelspiderHotelCode },
        });
      }
    }

    // Update credentials if any changes
    if (Object.keys(credentialUpdates).length > 0) {
      if (hotel.credentials) {
        // Update existing credentials
        await prisma.hotelCredentials.update({
          where: { hotelId },
          data: credentialUpdates,
        });
      } else {
        // Create credentials if they don't exist
        await prisma.hotelCredentials.create({
          data: {
            hotelId,
            ...credentialUpdates,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Hotel updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating hotel:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update hotel' },
      { status: 500 }
    );
  }
}

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
