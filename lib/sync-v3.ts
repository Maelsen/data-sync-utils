import 'dotenv/config';
import { addHours, subDays, min } from 'date-fns';
import { prisma } from './prisma';
import { MewsClient } from './mews';
import { discoverTreeProduct } from './product-discovery';

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

/**
 * Get ServiceIds from env or configuration
 * Returns empty array if not configured (will fetch from all services)
 */
function getServiceIds(): string[] {
    // Option 1: Multiple service IDs from env
    if (process.env.MEWS_SERVICE_IDS) {
        return process.env.MEWS_SERVICE_IDS.split(',').map(id => id.trim());
    }

    // Option 2: No service filtering - get all services
    // NOTE: orderitems/getAll works without ServiceIds parameter
    return [];
}

/**
 * Fetch all products with pagination
 * NOTE: products/getAll doesn't work in demo environment - returns 0 products
 * We'll filter by product name from OrderItems instead
 */
async function fetchAllProducts(mews: MewsClient, serviceIds: string[]): Promise<any[]> {
    console.log('[sync-v3] Fetching products...');

    try {
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

            console.log(`[sync-v3] Products page ${pageCount} (cursor: ${cursor.slice(0, 8)}...)`);
        } while (cursor);

        console.log(`[sync-v3] Fetched ${products.length} products total`);
        return products;
    } catch (error) {
        console.warn('[sync-v3] products/getAll failed - will filter by product name instead');
        return [];
    }
}

/**
 * Filter products to find tree products by ID or name
 * If products array is empty (API didn't return products), use TREE_PRODUCT_ID from env
 */
function filterTreeProducts(products: any[]): string[] {
    const targetProductId = process.env.TREE_PRODUCT_ID || process.env.TREE_SERVICE_ID;

    // If no products from API but we have a target ID, use it directly
    if (products.length === 0 && targetProductId) {
        console.log(`[sync-v3] No products from API - using TREE_PRODUCT_ID from env: ${targetProductId}`);
        return [targetProductId];
    }

    let treeProducts: any[] = [];

    if (targetProductId) {
        console.log(`[sync-v3] Filtering by Product ID: ${targetProductId}`);
        treeProducts = products.filter((p: any) => p.Id === targetProductId);
    } else {
        console.log(`[sync-v3] Filtering by name contains: '${TREE_NAME}'`);
        treeProducts = products.filter((p: any) =>
            (p.Name || '').toLowerCase().includes(TREE_NAME)
        );
    }

    console.log(`[sync-v3] Found ${treeProducts.length} tree product(s): ${treeProducts.map(p => p.Name).join(', ')}`);

    return treeProducts.map((p: any) => p.Id);
}

/**
 * New sync implementation using products/getAll + orderitems/getAll
 */
export async function syncTreeOrdersV3() {
    console.log('[sync-v3] Start - New Multi-Endpoint Architecture');
    console.log(`[sync-v3] Client token: ${CLIENT_TOKEN.slice(0, 8)}...`);
    console.log(`[sync-v3] Access token: ${ACCESS_TOKEN.slice(0, 8)}...`);

    if (!CLIENT_TOKEN || !ACCESS_TOKEN) {
        throw new Error('Missing Mews credentials (MEWS_CLIENT_TOKEN / MEWS_ACCESS_TOKEN)');
    }

    const mews = new MewsClient({
        clientToken: CLIENT_TOKEN,
        accessToken: ACCESS_TOKEN,
        clientName: 'Click A Tree Integration 1.0.0',
    });

    const serviceIds = getServiceIds();
    console.log(`[sync-v3] Service IDs: ${serviceIds.join(', ')}`);

    // STEP 1: Fetch configuration + products in PARALLEL (once per sync)
    console.log('[sync-v3] STEP 1: Fetching configuration and products...');
    const [configData, allProducts] = await Promise.all([
        mews.getConfiguration(),
        fetchAllProducts(mews, serviceIds)
    ]);

    const enterprise = configData.Enterprise || { Id: 'demo-hotel', Name: 'Demo Hotel' };
    console.log(`[sync-v3] Enterprise: ${enterprise.Name} (${enterprise.Id})`);

    // STEP 2: Filter for tree products
    let treeProductIds = filterTreeProducts(allProducts);

    // BRÜCKE: Wenn keine Produkte gefunden und keine ID konfiguriert → Auto-Discovery
    if (treeProductIds.length === 0 && !process.env.TREE_PRODUCT_ID) {
        console.log('[sync-v3] No products found via API - trying auto-discovery...');

        const discoveryResult = await discoverTreeProduct(mews);

        if (discoveryResult.success && discoveryResult.product) {
            console.log(`[sync-v3] ✅ Auto-discovered: ${discoveryResult.product.name}`);
            console.log(`[sync-v3]    ID: ${discoveryResult.product.id}`);
            console.log(`[sync-v3]    Confidence: ${discoveryResult.product.confidence}`);
            console.log(`[sync-v3]    Matched term: "${discoveryResult.product.matchedTerm}"`);
            treeProductIds = [discoveryResult.product.id];
        } else {
            console.error('[sync-v3] Auto-discovery failed:', discoveryResult.error);
        }
    }

    if (treeProductIds.length === 0) {
        console.error('[sync-v3] ERROR: No tree products found!');
        console.error('[sync-v3] Check TREE_PRODUCT_ID or TREE_PRODUCT_NAME environment variables');
        throw new Error('No tree products found - check configuration');
    }

    // STEP 3: Paginate through order items in time windows
    console.log('[sync-v3] STEP 2: Fetching order items...');
    const lookbackDays = 30;
    const windowHours = 96; // API limit
    const windowEnd = addHours(new Date(), 24);
    let cursor = subDays(windowEnd, lookbackDays);

    const allOrderItems: any[] = [];

    while (cursor < windowEnd) {
        const chunkStart = cursor;
        const chunkEndDate = addHours(cursor, windowHours);
        const chunkEnd = chunkEndDate > windowEnd ? windowEnd : chunkEndDate;

        console.log(`[sync-v3] Fetching ${chunkStart.toISOString()} -> ${chunkEnd.toISOString()}`);

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
                console.log(`[sync-v3]   No more pages (fetched ${pageCount} pages)`);
                break;
            }

            if (pageCount >= MAX_PAGES) {
                console.warn(`[sync-v3]   WARNING: Max pages (${MAX_PAGES}) reached, stopping pagination`);
                break;
            }

            console.log(`[sync-v3]   Page ${pageCount}/${MAX_PAGES}`);
        } while (pageCursor);

        cursor = chunkEnd;
    }

    console.log(`[sync-v3] Collected ${allOrderItems.length} total order items`);

    // STEP 4: Filter for tree order items
    console.log('[sync-v3] STEP 3: Filtering tree order items...');
    const treeOrderItems = allOrderItems.filter((oi: any) => {
        // Must be ProductOrder type
        if (oi.Type !== 'ProductOrder') {
            return false;
        }

        // Must have ProductId in nested Data.Product
        if (!oi.Data?.Product?.ProductId) {
            console.warn(`[sync-v3] OrderItem ${oi.Id} missing ProductId`);
            return false;
        }

        // Exclude canceled orders (check CanceledUtc field)
        // If CanceledUtc is set, the order was canceled
        if (oi.CanceledUtc) {
            console.log(`[sync-v3] Skipping canceled order: ${oi.Id} (canceled at ${oi.CanceledUtc})`);
            return false;
        }

        // Must match tree product IDs
        return treeProductIds.includes(oi.Data.Product.ProductId);
    });

    console.log(`[sync-v3] Found ${treeOrderItems.length} tree order items`);

    // STEP 5: Convert to treeLines format
    // NOTE: OrderItems have StartUtc directly - this is the check-in date from the linked reservation
    // No need for separate API call to reservations/getAll
    const treeLines = treeOrderItems.map((item: any) => {
        const unitPrice = toNumber(item.UnitAmount?.GrossValue, 0);
        const quantity = toNumber(item.UnitCount, 1);
        const totalPrice = unitPrice * quantity; // CRITICAL: Calculate total price

        // StartUtc on OrderItem = check-in date (from linked reservation)
        // This is when the product consumption starts, which aligns with guest check-in
        const checkInAt = item.StartUtc ? toDate(item.StartUtc) : null;

        return {
            mewsId: item.Id,
            quantity: quantity,
            amount: totalPrice, // Store TOTAL price, not unit price
            currency: item.UnitAmount?.Currency || 'EUR',
            bookedAt: toDate(item.CreatedUtc),
            checkInAt: checkInAt, // Check-in date directly from OrderItem.StartUtc
            state: item.AccountingState || 'Unknown'
        };
    });

    console.log(`[sync-v3] STEP 4: Database operations...`);
    console.log(`[sync-v3] Tree lines total: ${treeLines.length}`);

    if (treeLines.length === 0) {
        console.log('[sync-v3] No tree orders found in sync window');
        return;
    }

    // STEP 6: Upsert hotel
    const hotel = await prisma.hotel.upsert({
        where: { mewsId: enterprise.Id },
        update: { name: enterprise.Name },
        create: { mewsId: enterprise.Id, name: enterprise.Name, pmsType: 'mews' }
    });

    console.log(`[sync-v3] Hotel: ${hotel.name} (${hotel.id})`);

    // STEP 7: Delete canceled orders (not in current sync window)
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

    console.log(`[sync-v3] Existing orders in DB: ${existingOrders.length}`);
    console.log(`[sync-v3] Current orders from Mews: ${currentMewsIds.size}`);
    console.log(`[sync-v3] Orders to delete (canceled, within window): ${ordersToDelete.length}`);

    if (ordersToDelete.length > 0) {
        const deletedIds = ordersToDelete.map((o) => o.mewsId);
        await prisma.treeOrder.deleteMany({
            where: { mewsId: { in: deletedIds } }
        });
        console.log(`[sync-v3] Deleted ${ordersToDelete.length} canceled orders`);
    }

    // STEP 8: Upsert tree orders
    for (const line of treeLines) {
        await prisma.treeOrder.upsert({
            where: { mewsId: line.mewsId },
            update: {
                hotelId: hotel.id,
                quantity: line.quantity,
                amount: line.amount,
                currency: line.currency,
                bookedAt: line.bookedAt,
                checkInAt: line.checkInAt // NEW: Store check-in date if available
            },
            create: {
                mewsId: line.mewsId,
                hotelId: hotel.id,
                pmsType: 'mews',
                quantity: line.quantity,
                amount: line.amount,
                currency: line.currency,
                bookedAt: line.bookedAt,
                checkInAt: line.checkInAt // NEW: Store check-in date if available
            }
        });
    }

    console.log(`[sync-v3] Complete - ${treeLines.length} orders synced`);
    console.log('[sync-v3] ✅ Sync successful');
}
