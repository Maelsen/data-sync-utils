import { prisma } from './prisma';
import { MewsClient } from './mews';
import { subDays, startOfDay, endOfDay } from 'date-fns';

// Configuration - In a real app, these might come from the DB per hotel
const MEWS_CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const MEWS_ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';
const TREE_PRODUCT_NAME = 'Tree'; // The name of the product in Mews

export async function syncTreeOrders() {
    if (!MEWS_CLIENT_TOKEN || !MEWS_ACCESS_TOKEN) {
        console.error('Missing Mews credentials');
        return;
    }

    const mews = new MewsClient({
        clientToken: MEWS_CLIENT_TOKEN,
        accessToken: MEWS_ACCESS_TOKEN,
    });

    // Sync for the last 3 days to catch any updates or missed items
    const startUtc = subDays(startOfDay(new Date()), 3).toISOString();
    const endUtc = endOfDay(new Date()).toISOString();

    console.log(`Syncing Mews data from ${startUtc} to ${endUtc}...`);

    try {
        const data = await mews.getReservations(startUtc, endUtc);
        const reservations = data.Reservations || [];

        console.log(`Found ${reservations.length} reservations.`);

        for (const res of reservations) {
            // Check for products (Upsells)
            // Note: The structure depends on Mews API response. 
            // Usually products are linked via 'ProductAssignments' or similar if Extent.Products is true.
            // However, 'reservations/getAll' with Extent.Products returns a list of products in the response root usually, 
            // or we might need to look at 'Items' if they are charged items.

            // Let's assume we are looking for 'Items' (consumption) or 'ProductAssignments'.
            // Based on docs, 'reservations/getAll' returns 'Reservations', 'Customers', 'Items', 'Products', etc.

            // We'll iterate through the 'Items' or 'ProductAssignments' if available in the response.
            // For this implementation, I'll assume the response contains a list of 'Items' which represent the charges/products.

            // Wait, Mews 'reservations/getAll' returns a flat structure of lists.
            // We need to filter the 'Items' list for our Tree product.
        }

        // Better approach: The response from getAll contains lists of entities.
        const items = data.Items || [];
        const products = data.Products || [];

        // Find the product ID for "Tree"
        const treeProducts = products.filter((p: any) => p.Name.includes(TREE_PRODUCT_NAME));
        const treeProductIds = treeProducts.map((p: any) => p.Id);

        if (treeProductIds.length === 0) {
            console.log(`No product found with name "${TREE_PRODUCT_NAME}"`);
            // In a real scenario, we might want to continue if we are looking for historical items by name, 
            // but if we rely on ID, we need it.
        }

        // Filter items that match the tree product IDs
        const treeItems = items.filter((item: any) => treeProductIds.includes(item.ProductId));

        console.log(`Found ${treeItems.length} tree items.`);

        // Ensure Hotel exists
        // In a single hotel setup, we might just have one. 
        // If Mews returns Enterprise info, we use that. Otherwise, we use a default or the first one.
        // For now, let's create/find a default hotel.
        const hotel = await prisma.hotel.upsert({
            where: { mewsId: 'default-hotel' },
            update: {},
            create: {
                mewsId: 'default-hotel',
                name: 'My Hotel',
            },
        });

        for (const item of treeItems) {
            // item.Count is usually the quantity
            const quantity = item.Count || 1;
            const amount = item.Amount?.Value || 0;
            const currency = item.Amount?.Currency || 'EUR';

            await prisma.treeOrder.upsert({
                where: { mewsId: item.Id },
                update: {
                    quantity,
                    amount,
                    currency,
                    bookedAt: new Date(item.CreatedUtc), // or ConsumptionUtc
                },
                create: {
                    mewsId: item.Id,
                    hotelId: hotel.id,
                    quantity,
                    amount,
                    currency,
                    bookedAt: new Date(item.CreatedUtc),
                },
            });
        }

        console.log('Sync complete.');

    } catch (error) {
        console.error('Sync failed:', error);
    }
}
