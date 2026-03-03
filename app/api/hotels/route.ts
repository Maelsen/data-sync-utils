/**
 * Hotel Management API
 *
 * GET  /api/hotels - List all hotels
 * POST /api/hotels - Create new hotel with encrypted credentials
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';
import { PmsType } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hotels
 * List all hotels
 */
export async function GET() {
  try {
    const hotels = await prisma.hotel.findMany({
      select: {
        id: true,
        name: true,
        pmsType: true,
        externalId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(hotels);
  } catch (error: any) {
    console.error('Error fetching hotels:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch hotels' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/hotels
 * Create new hotel with encrypted credentials
 *
 * Body:
 * {
 *   name: string,
 *   pmsType: 'mews' | 'hotelspider' | 'hotelpartner',
 *   credentials: {
 *     // For Mews:
 *     mewsClientToken?: string,
 *     mewsAccessToken?: string,
 *     // For HotelSpider:
 *     hotelspiderUsername?: string,
 *     hotelspiderPassword?: string,
 *     hotelspiderHotelCode?: string,
 *     // For HotelPartner:
 *     hotelpartnerUsername?: string,
 *     hotelpartnerPassword?: string,
 *     hotelpartnerHotelId?: string,
 *     hotelpartnerExtraId?: string,
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, pmsType, credentials } = body;

    // Validate required fields
    if (!name || !pmsType || !credentials) {
      return NextResponse.json(
        { error: 'Missing required fields: name, pmsType, credentials' },
        { status: 400 }
      );
    }

    // Validate PMS type
    if (pmsType !== 'mews' && pmsType !== 'hotelspider' && pmsType !== 'hotelpartner') {
      return NextResponse.json(
        { error: 'Invalid pmsType. Must be "mews", "hotelspider", or "hotelpartner"' },
        { status: 400 }
      );
    }

    // Validate credentials based on PMS type
    if (pmsType === 'mews') {
      if (!credentials.mewsClientToken || !credentials.mewsAccessToken) {
        return NextResponse.json(
          { error: 'Mews credentials require mewsClientToken and mewsAccessToken' },
          { status: 400 }
        );
      }
    } else if (pmsType === 'hotelspider') {
      if (
        !credentials.hotelspiderUsername ||
        !credentials.hotelspiderPassword ||
        !credentials.hotelspiderHotelCode
      ) {
        return NextResponse.json(
          {
            error:
              'HotelSpider credentials require hotelspiderUsername, hotelspiderPassword, and hotelspiderHotelCode',
          },
          { status: 400 }
        );
      }
    } else if (pmsType === 'hotelpartner') {
      if (
        !credentials.hotelpartnerUsername ||
        !credentials.hotelpartnerPassword ||
        !credentials.hotelpartnerHotelId
      ) {
        return NextResponse.json(
          {
            error:
              'HotelPartner credentials require hotelpartnerUsername, hotelpartnerPassword, and hotelpartnerHotelId',
          },
          { status: 400 }
        );
      }
    }

    // Create hotel and credentials in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Determine externalId and mewsId based on PMS type
      let externalId: string;
      let mewsId: string;
      if (pmsType === 'mews') {
        externalId = 'pending-verification';
        mewsId = 'pending-verification';
      } else if (pmsType === 'hotelspider') {
        externalId = credentials.hotelspiderHotelCode;
        mewsId = `hs-${credentials.hotelspiderHotelCode}`;
      } else {
        externalId = credentials.hotelpartnerHotelId;
        mewsId = `hotelpartner-${credentials.hotelpartnerHotelId}`;
      }

      // Create hotel
      const hotel = await tx.hotel.create({
        data: {
          name,
          pmsType: pmsType as PmsType,
          externalId,
          mewsId,
        },
      });

      // Create encrypted credentials
      if (pmsType === 'mews') {
        await tx.hotelCredentials.create({
          data: {
            hotelId: hotel.id,
            mewsClientToken: encrypt(credentials.mewsClientToken),
            mewsAccessToken: encrypt(credentials.mewsAccessToken),
          },
        });
      } else if (pmsType === 'hotelspider') {
        await tx.hotelCredentials.create({
          data: {
            hotelId: hotel.id,
            hotelspiderUsername: encrypt(credentials.hotelspiderUsername),
            hotelspiderPassword: encrypt(credentials.hotelspiderPassword),
            hotelspiderHotelCode: credentials.hotelspiderHotelCode,
          },
        });
      } else if (pmsType === 'hotelpartner') {
        await tx.hotelCredentials.create({
          data: {
            hotelId: hotel.id,
            hotelpartnerUsername: encrypt(credentials.hotelpartnerUsername),
            hotelpartnerPassword: encrypt(credentials.hotelpartnerPassword),
            hotelpartnerHotelId: credentials.hotelpartnerHotelId,
            hotelpartnerExtraId: credentials.hotelpartnerExtraId || null,
          },
        });
      }

      return hotel;
    });

    return NextResponse.json(
      {
        success: true,
        hotel: {
          id: result.id,
          name: result.name,
          pmsType: result.pmsType,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating hotel:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create hotel' },
      { status: 500 }
    );
  }
}
