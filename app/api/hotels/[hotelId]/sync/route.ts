/**
 * Hotel-Specific Sync API
 *
 * GET /api/hotels/[hotelId]/sync
 * Syncs tree orders for a specific hotel using its own credentials
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { MewsClient } from '@/lib/mews';
import { addHours, subDays } from 'date-fns';

export const dynamic = 'force-dynamic';

function toNumber(value: any, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toDate(value: any) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : new Date();
}

function extractQuantity(item: any): number {
  // Try Count field first (older API)
  if (item.Count !== undefined && item.Count !== null) {
    return toNumber(item.Count, 1);
  }

  // Try extracting from Name field (newer API format: "4 × CLICK_A_TREE")
  if (item.Name && typeof item.Name === 'string') {
    const match = item.Name.match(/^(\d+)\s*×/);
    if (match) {
      return toNumber(match[1], 1);
    }
  }

  // Fallback to 1
  return 1;
}

/**
 * GET /api/hotels/[hotelId]/sync
 * Sync orders for a specific Mews hotel using its credentials
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hotelId: string }> }
) {
  try {
    const { hotelId } = await params;

    // Fetch hotel with credentials
    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
      include: { credentials: true },
    });

    if (!hotel) {
      return NextResponse.json({ error: 'Hotel not found' }, { status: 404 });
    }

    // Only sync for Mews hotels
    if (hotel.pmsType !== 'mews') {
      return NextResponse.json(
        { error: 'Sync is only available for Mews hotels' },
        { status: 400 }
      );
    }

    // Check if credentials exist
    if (!hotel.credentials?.mewsClientToken || !hotel.credentials?.mewsAccessToken) {
      return NextResponse.json(
        { error: 'Hotel credentials not found. Please update hotel settings.' },
        { status: 400 }
      );
    }

    // Decrypt credentials
    const clientToken = decrypt(hotel.credentials.mewsClientToken);
    const accessToken = decrypt(hotel.credentials.mewsAccessToken);

    console.log(`[hotel-sync] Starting sync for hotel: ${hotel.name} (${hotelId})`);
    console.log(`[hotel-sync] Using hotel-specific credentials`);

    // Initialize Mews client with hotel-specific credentials
    const mews = new MewsClient({
      clientToken,
      accessToken,
      clientName: 'Click A Tree Integration 1.0.0',
    });

    const lookbackDays = 30;
    const windowHours = 96; // API limit is 100h

    const windowEnd = addHours(new Date(), 24);
    let cursor = subDays(windowEnd, lookbackDays);

    const allItems: any[] = [];
    const allOrderItems: any[] = [];
    const allAssignments: any[] = [];
    const productMap = new Map<string, any>();
    let enterprise: any = null;

    // Fetch data from Mews
    while (cursor < windowEnd) {
      const chunkStart = cursor;
      const chunkEndDate = addHours(cursor, windowHours);
      const chunkEnd = chunkEndDate > windowEnd ? windowEnd : chunkEndDate;

      console.log(`[hotel-sync] Fetching ${chunkStart.toISOString()} -> ${chunkEnd.toISOString()}`);

      let pageCursor: string | undefined;
      do {
        const data = await mews.getReservations(
          chunkStart.toISOString(),
          chunkEnd.toISOString(),
          pageCursor
        );

        if (!enterprise && data.Enterprise) {
          enterprise = data.Enterprise;
        }

        (data.Items || []).forEach((i: any) => allItems.push(i));
        (data.OrderItems || []).forEach((i: any) => allOrderItems.push(i));
        (data.ProductAssignments || []).forEach((p: any) => allAssignments.push(p));
        (data.Products || []).forEach((p: any) => productMap.set(p.Id, p));

        pageCursor = data.Cursor;
        if (pageCursor) {
          console.log('[hotel-sync] Fetching next page...');
        }
      } while (pageCursor);

      cursor = chunkEnd;
    }

    const products = Array.from(productMap.values());
    console.log(
      `[hotel-sync] Collected ${allItems.length} Items, ${allOrderItems.length} OrderItems, ${allAssignments.length} ProductAssignments, ${products.length} products`
    );

    // Filter for tree products
    const TREE_NAME = (process.env.TREE_PRODUCT_NAME || 'tree').toLowerCase();
    const targetProductId = process.env.TREE_PRODUCT_ID || process.env.TREE_SERVICE_ID;

    let treeProducts: any[] = [];
    if (targetProductId) {
      console.log(`[hotel-sync] Filtering by Product ID: ${targetProductId}`);
      treeProducts = products.filter((p: any) => p.Id === targetProductId);
    } else {
      console.log(`[hotel-sync] Filtering by name contains: '${TREE_NAME}'`);
      treeProducts = products.filter((p: any) =>
        (p.Name || '').toLowerCase().includes(TREE_NAME)
      );
    }

    const treeProductIds = treeProducts.map((p: any) => p.Id);
    console.log(`[hotel-sync] Found ${treeProductIds.length} tree product(s)`);

    if (treeProductIds.length === 0) {
      console.log('[hotel-sync] No tree products found - sync complete (no changes)');
      return NextResponse.json({
        success: true,
        message: 'No tree products found in Mews',
        synced: 0,
      });
    }

    // Filter tree items directly (modern approach matching sync-v2.ts)
    const treeItems = allItems.filter((item: any) =>
      treeProductIds.includes(item.ProductId)
    );
    const treeOrderItems = allOrderItems.filter((item: any) =>
      treeProductIds.includes(item.ProductId)
    );
    const treeAssignments = allAssignments.filter((item: any) =>
      treeProductIds.includes(item.ProductId)
    );

    const treeLines = [
      ...treeItems.map((item: any) => ({
        mewsId: item.Id,
        quantity: extractQuantity(item),
        amount: toNumber(item.Amount?.Value ?? item.AmountBeforeTaxes?.Value, 0),
        currency: item.Amount?.Currency || item.AmountBeforeTaxes?.Currency || 'EUR',
        bookedAt: toDate(item.ConsumptionUtc || item.CreatedUtc),
        state: item.State,
        type: 'Item',
      })),
      ...treeOrderItems.map((item: any) => ({
        mewsId: item.Id,
        quantity: extractQuantity(item),
        amount: toNumber(item.Amount?.Value ?? item.TotalPrice?.Value, 0),
        currency: item.Amount?.Currency || item.TotalPrice?.Currency || 'EUR',
        bookedAt: toDate(item.CreatedUtc),
        state: item.State,
        type: 'OrderItem',
      })),
      ...treeAssignments.map((item: any) => ({
        mewsId: item.Id,
        quantity: extractQuantity(item),
        amount: toNumber(item.Amount?.Value ?? item.Price?.Value, 0),
        currency: item.Amount?.Currency || item.Price?.Currency || 'EUR',
        bookedAt: toDate(item.StartUtc || item.CreatedUtc),
        state: item.State,
        type: 'ProductAssignment',
      })),
    ];

    console.log(`[hotel-sync] Found ${treeLines.length} tree line(s)`);

    if (treeLines.length === 0) {
      console.log('[hotel-sync] No tree orders found - sync complete');
      return NextResponse.json({
        success: true,
        message: 'No tree orders found in window',
        synced: 0,
      });
    }

    // Get existing orders from database
    const syncWindowStart = subDays(new Date(), 30);
    const existingOrders = await prisma.treeOrder.findMany({
      where: { hotelId: hotel.id },
      select: { mewsId: true, id: true, bookedAt: true },
    });

    // Find orders to delete (no longer in Mews, within sync window)
    const currentMewsIds = new Set(treeLines.map((line: any) => line.mewsId));
    const ordersToDelete = existingOrders.filter(
      (order) =>
        !currentMewsIds.has(order.mewsId) && order.bookedAt >= syncWindowStart
    );

    if (ordersToDelete.length > 0) {
      const deletedIds = ordersToDelete.map((o) => o.mewsId);
      await prisma.treeOrder.deleteMany({
        where: { mewsId: { in: deletedIds } },
      });
      console.log(
        `[hotel-sync] Deleted ${ordersToDelete.length} canceled order(s)`
      );
    }

    // Process tree lines - upsert all
    let syncedCount = 0;
    for (const line of treeLines) {
      await prisma.treeOrder.upsert({
        where: { mewsId: line.mewsId },
        update: {
          hotelId: hotel.id,
          quantity: line.quantity,
          amount: line.amount,
          currency: line.currency,
          bookedAt: line.bookedAt,
        },
        create: {
          mewsId: line.mewsId,
          hotelId: hotel.id,
          pmsType: 'mews',
          quantity: line.quantity,
          amount: line.amount,
          currency: line.currency,
          bookedAt: line.bookedAt,
        },
      });
      syncedCount++;
    }

    console.log(`[hotel-sync] Sync complete - ${syncedCount} new order(s)`);

    return NextResponse.json({
      success: true,
      message: `Synced ${syncedCount} new order(s)`,
      synced: syncedCount,
      hotel: hotel.name,
    });
  } catch (error: any) {
    console.error('[hotel-sync] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    );
  }
}
