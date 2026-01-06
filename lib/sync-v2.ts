import 'dotenv/config';
import { addHours, subDays } from 'date-fns';
import { prisma } from './prisma';
import { MewsClient } from './mews';

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';
const TREE_NAME = (process.env.TREE_PRODUCT_NAME || 'tree').toLowerCase();

function toNumber(value: any, fallback = 0) {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function toDate(value: any) {
    const d = value ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime()) ? d : new Date();
}

export async function syncTreeOrdersV2() {
    console.log('[sync] start');
    console.log(`[sync] client token: ${CLIENT_TOKEN.slice(0, 8)}...`);
    console.log(`[sync] access token: ${ACCESS_TOKEN.slice(0, 8)}...`);

    if (!CLIENT_TOKEN || !ACCESS_TOKEN) {
        throw new Error('Missing Mews credentials (MEWS_CLIENT_TOKEN / MEWS_ACCESS_TOKEN)');
    }

    const mews = new MewsClient({
        clientToken: CLIENT_TOKEN,
        accessToken: ACCESS_TOKEN,
        clientName: 'Click A Tree Integration 1.0.0',
    });

    const lookbackDays = 30;
    const windowHours = 96; // API limit is 100h

    const windowEnd = addHours(new Date(), 24); // look slightly ahead so today's upsells are included
    let cursor = subDays(windowEnd, lookbackDays);

    const allItems: any[] = [];
    const allOrderItems: any[] = [];
    const allAssignments: any[] = [];
    const productMap = new Map<string, any>();
    let enterprise: any = null;

    while (cursor < windowEnd) {
        const chunkStart = cursor;
        const chunkEndDate = addHours(cursor, windowHours);
        const chunkEnd = chunkEndDate > windowEnd ? windowEnd : chunkEndDate;

        console.log(`[sync] fetch ${chunkStart.toISOString()} -> ${chunkEnd.toISOString()}`);

        let pageCursor: string | undefined;
        let pageCount = 0;
        const MAX_PAGES = 100; // Safety limit to prevent infinite loops
        do {
            const data = await mews.getReservations(chunkStart.toISOString(), chunkEnd.toISOString(), pageCursor);

            if (!enterprise && data.Enterprise) {
                enterprise = data.Enterprise;
            }

            const hasData = (data.Reservations && data.Reservations.length > 0);

            (data.Items || []).forEach((i: any) => allItems.push(i));
            (data.OrderItems || []).forEach((i: any) => allOrderItems.push(i));
            (data.ProductAssignments || []).forEach((p: any) => allAssignments.push(p));
            (data.Products || []).forEach((p: any) => productMap.set(p.Id, p));

            pageCursor = data.Cursor;
            pageCount++;

            // Stop pagination if: no data returned, cursor is empty, or max pages reached
            if (!hasData) {
                console.log(`[sync]   no more data, stopping pagination`);
                pageCursor = undefined;
            } else if (!pageCursor || pageCursor.trim() === '') {
                pageCursor = undefined;
            } else {
                console.log(`[sync]   cursor -> next page (${pageCount}/${MAX_PAGES})`);
                if (pageCount >= MAX_PAGES) {
                    console.warn(`[sync] WARNING: Reached maximum page limit (${MAX_PAGES}), stopping pagination`);
                    pageCursor = undefined;
                }
            }
        } while (pageCursor);

        cursor = chunkEnd;
    }

    const products = Array.from(productMap.values());
    console.log(
        `[sync] collected ${allItems.length} Items, ${allOrderItems.length} OrderItems, ${allAssignments.length} ProductAssignments, ${products.length} products`,
    );

    // DEBUG: Log all products to see what we're getting from Mews
    console.log('[sync] DEBUG: All products from Mews:');
    products.forEach((p: any) => {
        console.log(`  - ID: ${p.Id}, Name: "${p.Name}"`);
    });

    const targetProductId = process.env.TREE_PRODUCT_ID || process.env.TREE_SERVICE_ID; // Support both names for backwards compatibility
    let treeProducts: any[] = [];

    if (targetProductId) {
        console.log(`[sync] filtering by Product ID: ${targetProductId}`);
        treeProducts = products.filter((p: any) => p.Id === targetProductId);
        console.log(`[sync] DEBUG: Found ${treeProducts.length} products matching ID ${targetProductId}`);
    } else {
        console.log(`[sync] filtering by name contains: '${TREE_NAME}'`);
        treeProducts = products.filter((p: any) => (p.Name || '').toLowerCase().includes(TREE_NAME));
        console.log(`[sync] DEBUG: Found ${treeProducts.length} products with name containing '${TREE_NAME}'`);
    }

    const treeProductIds = treeProducts.map((p: any) => p.Id);
    console.log(`[sync] found ${treeProducts.length} target products: ${treeProducts.map((p: any) => p.Name).join(', ') || 'none'}`);

    const treeItems = allItems.filter((item: any) => treeProductIds.includes(item.ProductId));
    const treeOrderItems = allOrderItems.filter((item: any) => treeProductIds.includes(item.ProductId));
    const treeAssignments = allAssignments.filter((item: any) => treeProductIds.includes(item.ProductId));

    const treeLines = [
        ...treeItems.map((item: any) => ({
            mewsId: item.Id,
            quantity: toNumber(item.Count, 1),
            amount: toNumber(item.Amount?.Value ?? item.AmountBeforeTaxes?.Value, 0),
            currency: item.Amount?.Currency || item.AmountBeforeTaxes?.Currency || 'EUR',
            bookedAt: toDate(item.ConsumptionUtc || item.CreatedUtc),
            state: item.State,
            type: 'Item',
        })),
        ...treeOrderItems.map((item: any) => ({
            mewsId: item.Id,
            quantity: toNumber(item.Count, 1),
            amount: toNumber(item.Amount?.Value ?? item.TotalPrice?.Value, 0),
            currency: item.Amount?.Currency || item.TotalPrice?.Currency || 'EUR',
            bookedAt: toDate(item.CreatedUtc),
            state: item.State,
            type: 'OrderItem',
        })),
        ...treeAssignments.map((item: any) => ({
            mewsId: item.Id,
            quantity: toNumber(item.Count, 1),
            amount: toNumber(item.Amount?.Value ?? item.Price?.Value, 0),
            currency: item.Amount?.Currency || item.Price?.Currency || 'EUR',
            bookedAt: toDate(item.StartUtc || item.CreatedUtc),
            state: item.State,
            type: 'ProductAssignment',
        })),
    ];

    console.log(`[sync] tree lines total: ${treeLines.length}`);

    // DEBUG: Log each tree line with its state
    console.log('[sync] DEBUG: Tree lines breakdown:');
    treeLines.forEach((line: any, index: number) => {
        console.log(`  [${index}] ${line.type} - ID: ${line.mewsId.slice(0, 8)}... - State: ${line.state} - Qty: ${line.quantity} - Amount: ${line.amount}`);
    });

    if (treeLines.length === 0) {
        console.log('[sync] no tree sales found in window');
        // Even if no tree lines found in this window, we can't really do much about cleanup outside the window.
        // But the user issue is usually about recent cancellations.
        return;
    }

    const hotelId = enterprise?.Id || 'demo-hotel';
    const hotelName = enterprise?.Name || 'Mews Demo Hotel';

    const hotel = await prisma.hotel.upsert({
        where: { mewsId: hotelId },
        update: { name: hotelName },
        create: { mewsId: hotelId, name: hotelName },
    });

    // Calculate the start of our sync window (30 days ago)
    const syncWindowStart = subDays(new Date(), 30);

    // Get all existing tree orders for this hotel from the database
    const existingOrders = await prisma.treeOrder.findMany({
        where: { hotelId: hotel.id },
        select: { mewsId: true, id: true, bookedAt: true },
    });

    // Create a Set of mewsIds from the current Mews API response
    const currentMewsIds = new Set(treeLines.map((line: any) => line.mewsId));

    // Find orders that exist in DB but are NOT in the current Mews response
    // IMPORTANT: Only consider orders within our sync window!
    // Orders older than the window should be kept (they're just too old to appear in the API response)
    const ordersToDelete = existingOrders.filter((order) =>
        !currentMewsIds.has(order.mewsId) &&
        order.bookedAt >= syncWindowStart  // Only delete if it's within the sync window
    );

    console.log(`[sync] DEBUG: Sync window start: ${syncWindowStart.toISOString()}`);
    console.log(`[sync] DEBUG: Existing orders in DB: ${existingOrders.length}`);
    console.log(`[sync] DEBUG: Current orders from Mews: ${currentMewsIds.size}`);
    console.log(`[sync] DEBUG: Orders to delete (no longer in Mews, within window): ${ordersToDelete.length}`);

    // DEBUG: Show which orders are being kept because they're outside the window
    const oldOrdersKept = existingOrders.filter((order) =>
        !currentMewsIds.has(order.mewsId) &&
        order.bookedAt < syncWindowStart
    );
    if (oldOrdersKept.length > 0) {
        console.log(`[sync] DEBUG: Keeping ${oldOrdersKept.length} old orders (outside sync window, booked before ${syncWindowStart.toISOString().split('T')[0]})`);
    }

    // Delete orders that are no longer in Mews (they were canceled)
    if (ordersToDelete.length > 0) {
        const deletedIds = ordersToDelete.map((o) => o.mewsId);
        await prisma.treeOrder.deleteMany({
            where: { mewsId: { in: deletedIds } },
        });
        console.log(`[sync] deleted ${ordersToDelete.length} canceled orders: ${deletedIds.map(id => id.slice(0, 8)).join(', ')}`);
    }

    // Process current tree lines from Mews
    for (const line of treeLines) {
        /* 
        // We do NOT want to skip canceled orders anymore. 
        // We want to update them in the DB so their state becomes 'Canceled'.
        if (line.state === 'Canceled' || line.state === 'Voided' || line.quantity === 0) {
            console.log(`[sync] skipping order ${line.mewsId.slice(0, 8)}... with state: ${line.state}, qty: ${line.quantity}`);
            continue;
        }
        */

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
                quantity: line.quantity,
                amount: line.amount,
                currency: line.currency,
                bookedAt: line.bookedAt,
            },
        });
    }

    console.log('[sync] processed tree orders');
}
