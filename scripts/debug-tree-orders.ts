import 'dotenv/config';
import { MewsClient } from '../lib/mews';
import { subDays, addHours } from 'date-fns';

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';
const TREE_PRODUCT_ID = process.env.TREE_PRODUCT_ID || 'ff7f1d18-eb3a-47d2-a723-b3a2013d3ce0';

async function debugTreeOrders() {
    console.log('Checking Tree Orders from Mews API...\n');
    console.log(`Looking for Product ID: ${TREE_PRODUCT_ID}\n`);

    const mews = new MewsClient({
        clientToken: CLIENT_TOKEN,
        accessToken: ACCESS_TOKEN,
        clientName: 'Click A Tree Debug 1.0.0',
    });

    // Get recent order items (last 30 days)
    const lookbackDays = 30;
    const windowEnd = addHours(new Date(), 24);
    const windowStart = subDays(windowEnd, lookbackDays);

    console.log(`Fetching orders from ${windowStart.toISOString()} to ${windowEnd.toISOString()}\n`);

    const data = await mews.getOrderItems(
        [],
        { StartUtc: windowStart.toISOString(), EndUtc: windowEnd.toISOString() }
    );

    const allOrderItems = data.OrderItems || [];
    console.log(`Total order items: ${allOrderItems.length}\n`);

    // Filter for tree orders
    const treeOrders = allOrderItems.filter((oi: any) => {
        return oi.Type === 'ProductOrder' &&
               oi.Data?.Product?.ProductId === TREE_PRODUCT_ID;
    });

    console.log(`Total tree orders (before filtering canceled): ${treeOrders.length}\n`);

    // Split by canceled status
    const validTreeOrders = treeOrders.filter((oi: any) => !oi.CanceledUtc);
    const canceledTreeOrders = treeOrders.filter((oi: any) => oi.CanceledUtc);

    console.log(`Valid tree orders (CanceledUtc is NULL): ${validTreeOrders.length}`);
    console.log(`Canceled tree orders (CanceledUtc is set): ${canceledTreeOrders.length}\n`);

    // Show samples
    console.log('=== VALID TREE ORDERS (Sample) ===\n');
    validTreeOrders.slice(0, 10).forEach((oi: any, idx: number) => {
        console.log(`[${idx + 1}] ID: ${oi.Id.slice(0, 20)}...`);
        console.log(`    UnitCount: ${oi.UnitCount}`);
        console.log(`    Amount: ${oi.UnitAmount?.GrossValue || 0} ${oi.UnitAmount?.Currency}`);
        console.log(`    AccountingState: ${oi.AccountingState}`);
        console.log(`    CanceledUtc: ${oi.CanceledUtc || 'NULL'}`);
        console.log(`    CreatedUtc: ${oi.CreatedUtc}`);
        console.log();
    });

    console.log('\n=== CANCELED TREE ORDERS (Sample) ===\n');
    canceledTreeOrders.slice(0, 5).forEach((oi: any, idx: number) => {
        console.log(`[${idx + 1}] ID: ${oi.Id.slice(0, 20)}...`);
        console.log(`    UnitCount: ${oi.UnitCount}`);
        console.log(`    Amount: ${oi.UnitAmount?.GrossValue || 0} ${oi.UnitAmount?.Currency}`);
        console.log(`    AccountingState: ${oi.AccountingState}`);
        console.log(`    CanceledUtc: ${oi.CanceledUtc}`);
        console.log(`    CreatedUtc: ${oi.CreatedUtc}`);
        console.log();
    });

    // Calculate total trees
    const totalValidTrees = validTreeOrders.reduce((sum: number, oi: any) => sum + (oi.UnitCount || 1), 0);
    console.log(`\n\nTOTAL VALID TREES (sum of UnitCount): ${totalValidTrees}`);
}

debugTreeOrders()
    .then(() => {
        console.log('\n\nDebug completed!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Debug failed:', err);
        process.exit(1);
    });
