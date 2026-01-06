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

/**
 * Fetch all products with pagination
 */
async function fetchAllProducts(mews: MewsClient): Promise<any[]> {
  console.log('[hotel-sync] Fetching products...');

  // Get configuration to extract serviceIds
  const config = await mews.getConfiguration();
  const serviceIds = config.Services?.map((s: any) => s.Id) || [];

  if (serviceIds.length === 0) {
    console.warn('[hotel-sync] No service IDs found in configuration');
    return [];
  }

  const products: any[] = [];
  let cursor: string | undefined;
  let pageCount = 0;

  do {
    const data = await mews.getProducts(serviceIds, cursor);
    (data.Products || []).forEach((p: any) => products.push(p));
    cursor = data.Cursor;
    pageCount++;

    if (!cursor || cursor.trim() === '') {
      break;
    }

    console.log(`[hotel-sync] Products page ${pageCount} (cursor: ${cursor.slice(0, 8)}...)`);
  } while (cursor);

  console.log(`[hotel-sync] Fetched ${products.length} products total`);
  return products;
}

/**
 * Filter products to find tree products by ID or name
 */
function filterTreeProducts(products: any[]): string[] {
  const targetProductId = process.env.TREE_PRODUCT_ID || process.env.TREE_SERVICE_ID;
  const TREE_NAME = (process.env.TREE_PRODUCT_NAME || 'tree').toLowerCase();

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

  console.log(`[hotel-sync] Found ${treeProducts.length} tree product(s): ${treeProducts.map(p => p.Name).join(', ')}`);

  return treeProducts.map((p: any) => p.Id);
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

    // STEP 1: Fetch configuration and products (ONCE per sync)
    console.log('[hotel-sync] Fetching configuration and products...');
    const [configData, allProducts] = await Promise.all([
      mews.getConfiguration(),
      fetchAllProducts(mews)
    ]);

    const enterprise = configData.Enterprise || { Id: hotel.mewsId, Name: hotel.name };
    console.log(`[hotel-sync] Enterprise: ${enterprise.Name} (${enterprise.Id})`);

    // Get ServiceIds from configuration
    const serviceIds = configData.Services?.map((s: any) => s.Id) || [];
    console.log(`[hotel-sync] Service IDs: ${serviceIds.join(', ')}`);

    if (serviceIds.length === 0) {
      console.error('[hotel-sync] No service IDs found in configuration');
      return NextResponse.json(
        { error: 'No service IDs found in hotel configuration' },
        { status: 500 }
      );
    }

    // STEP 2: Filter for tree products
    const treeProductIds = filterTreeProducts(allProducts);

    if (treeProductIds.length === 0) {
      console.log('[hotel-sync] No tree products found - sync complete (no changes)');
      return NextResponse.json({
        success: true,
        message: 'No tree products found in Mews',
        synced: 0,
      });
    }

    // STEP 3: Paginate through order items in time windows
    console.log('[hotel-sync] Fetching order items...');
    const lookbackDays = 30;
    const windowHours = 96; // API limit
    const windowEnd = addHours(new Date(), 24);
    let cursor = subDays(windowEnd, lookbackDays);

    const allOrderItems: any[] = [];

    while (cursor < windowEnd) {
      const chunkStart = cursor;
      const chunkEndDate = addHours(cursor, windowHours);
      const chunkEnd = chunkEndDate > windowEnd ? windowEnd : chunkEndDate;

      console.log(`[hotel-sync] Fetching ${chunkStart.toISOString()} -> ${chunkEnd.toISOString()}`);

      // Paginate orderitems/getAll for this time window
      let pageCursor: string | undefined;
      let pageCount = 0;
      const MAX_PAGES = 100;

      do {
        const data = await mews.getOrderItems(
          serviceIds,
          { StartUtc: chunkStart.toISOString(), EndUtc: chunkEnd.toISOString() },
          pageCursor
        );

        (data.OrderItems || []).forEach((oi: any) => allOrderItems.push(oi));
        pageCursor = data.Cursor;
        pageCount++;

        if (!pageCursor || pageCursor.trim() === '') {
          console.log(`[hotel-sync]   No more pages (fetched ${pageCount} pages)`);
          break;
        }

        if (pageCount >= MAX_PAGES) {
          console.warn(`[hotel-sync]   WARNING: Max pages (${MAX_PAGES}) reached, stopping pagination`);
          break;
        }

        console.log(`[hotel-sync]   Page ${pageCount}/${MAX_PAGES}`);
      } while (pageCursor);

      cursor = chunkEnd;
    }

    console.log(`[hotel-sync] Collected ${allOrderItems.length} total order items`);

    // STEP 4: Filter for tree order items
    console.log('[hotel-sync] Filtering tree order items...');
    const treeOrderItems = allOrderItems.filter((oi: any) => {
      // Must be ProductOrder type
      if (oi.Type !== 'ProductOrder') {
        return false;
      }

      // Must have ProductId in nested Data.Product
      if (!oi.Data?.Product?.ProductId) {
        console.warn(`[hotel-sync] OrderItem ${oi.Id} missing ProductId`);
        return false;
      }

      // Exclude canceled/closed orders
      // Possible states: Pending, Confirmed, Closed, Canceled
      if (oi.State === 'Canceled' || oi.State === 'Closed') {
        console.log(`[hotel-sync] Skipping ${oi.State} order: ${oi.Id}`);
        return false;
      }

      // Must match tree product IDs
      return treeProductIds.includes(oi.Data.Product.ProductId);
    });

    console.log(`[hotel-sync] Found ${treeOrderItems.length} tree order items`);

    // STEP 5: Convert to treeLines format
    const treeLines = treeOrderItems.map((item: any) => ({
      mewsId: item.Id,
      quantity: toNumber(item.UnitCount, 1),
      amount: toNumber(item.UnitAmount?.GrossValue, 0),
      currency: item.UnitAmount?.Currency || 'EUR',
      bookedAt: toDate(item.CreatedUtc),
      state: item.State || 'Unknown'
    }));

    console.log(`[hotel-sync] Tree lines total: ${treeLines.length}`);

    if (treeLines.length === 0) {
      console.log('[hotel-sync] No tree orders found in sync window');
      return NextResponse.json({
        success: true,
        message: 'No tree orders found in sync window',
        synced: 0,
      });
    }

    // STEP 6: Delete canceled orders (not in current sync window)
    const syncWindowStart = subDays(new Date(), 30);
    const existingOrders = await prisma.treeOrder.findMany({
      where: { hotelId: hotel.id },
      select: { mewsId: true, id: true, bookedAt: true }
    });

    const currentMewsIds = new Set(treeLines.map((l: any) => l.mewsId));
    const ordersToDelete = existingOrders.filter((order) =>
      !currentMewsIds.has(order.mewsId) &&
      order.bookedAt >= syncWindowStart
    );

    console.log(`[hotel-sync] Existing orders in DB: ${existingOrders.length}`);
    console.log(`[hotel-sync] Current orders from Mews: ${currentMewsIds.size}`);
    console.log(`[hotel-sync] Orders to delete (canceled, within window): ${ordersToDelete.length}`);

    if (ordersToDelete.length > 0) {
      const deletedIds = ordersToDelete.map((o) => o.mewsId);
      await prisma.treeOrder.deleteMany({
        where: { mewsId: { in: deletedIds } }
      });
      console.log(`[hotel-sync] Deleted ${ordersToDelete.length} canceled orders`);
    }

    // STEP 7: Upsert tree orders
    let syncedCount = 0;
    for (const line of treeLines) {
      await prisma.treeOrder.upsert({
        where: { mewsId: line.mewsId },
        update: {
          hotelId: hotel.id,
          quantity: line.quantity,
          amount: line.amount,
          currency: line.currency,
          bookedAt: line.bookedAt
        },
        create: {
          mewsId: line.mewsId,
          hotelId: hotel.id,
          pmsType: 'mews',
          quantity: line.quantity,
          amount: line.amount,
          currency: line.currency,
          bookedAt: line.bookedAt
        }
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
