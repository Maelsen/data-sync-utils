import 'dotenv/config';
import { MewsClient } from '../lib/mews';
import { addHours } from 'date-fns';

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';
const TREE_NAME = (process.env.TREE_PRODUCT_NAME || 'tree').toLowerCase();

async function debugSync() {
    console.log('=== Debug Sync - Check Recent Tree Orders ===\n');
    console.log(`TREE_PRODUCT_NAME: "${TREE_NAME}"`);
    console.log(`TREE_SERVICE_ID: ${process.env.TREE_SERVICE_ID || '(not set)'}\n`);

    const mews = new MewsClient({
        clientToken: CLIENT_TOKEN,
        accessToken: ACCESS_TOKEN,
        clientName: 'Click A Tree Integration 1.0.0',
    });

    // Check last 48 hours
    const now = new Date();
    const windowStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const windowEnd = addHours(now, 1);

    console.log(`Checking orders from ${windowStart.toISOString()} to ${windowEnd.toISOString()}\n`);

    const data = await mews.getReservations(windowStart.toISOString(), windowEnd.toISOString());

    console.log(`Total Products: ${data.Products?.length || 0}`);
    console.log(`Total Items: ${data.Items?.length || 0}`);
    console.log(`Total OrderItems: ${data.OrderItems?.length || 0}\n`);

    // Check filtering logic
    const targetProductId = process.env.TREE_PRODUCT_ID || process.env.TREE_SERVICE_ID;
    let treeProducts: any[] = [];

    if (targetProductId) {
        console.log(`[FILTERING BY ID]: ${targetProductId}`);
        treeProducts = (data.Products || []).filter((p: any) => p.Id === targetProductId);
    } else {
        console.log(`[FILTERING BY NAME]: contains "${TREE_NAME}"`);
        treeProducts = (data.Products || []).filter((p: any) =>
            (p.Name || '').toLowerCase().includes(TREE_NAME)
        );
    }

    console.log(`\nTree Products Found: ${treeProducts.length}`);
    treeProducts.forEach((p: any) => {
        console.log(`  - "${p.Name}" (ID: ${p.Id})`);
    });

    if (treeProducts.length === 0) {
        console.log('\n❌ NO TREE PRODUCTS FOUND!');
        console.log('This is why no orders are syncing.\n');
        console.log('All products:');
        (data.Products || []).forEach((p: any, idx: number) => {
            console.log(`  [${idx + 1}] "${p.Name}"`);
        });
        return;
    }

    // Check for tree items
    const treeProductIds = treeProducts.map((p: any) => p.Id);
    const treeItems = (data.Items || []).filter((item: any) =>
        treeProductIds.includes(item.ProductId)
    );
    const treeOrderItems = (data.OrderItems || []).filter((item: any) =>
        treeProductIds.includes(item.ProductId)
    );

    console.log(`\nTree Items: ${treeItems.length}`);
    console.log(`Tree OrderItems: ${treeOrderItems.length}\n`);

    if (treeItems.length > 0) {
        console.log('Recent Tree Items:');
        treeItems.slice(0, 5).forEach((item: any) => {
            console.log(`  - ${item.CreatedUtc || item.ConsumptionUtc}: Count=${item.Count} @ ${item.Amount?.Value || 0} ${item.Amount?.Currency || 'USD'} (State: ${item.State})`);
            console.log(`    Full Item:`, JSON.stringify(item, null, 2));
        });
    }

    if (treeOrderItems.length > 0) {
        console.log('\nRecent Tree OrderItems:');
        treeOrderItems.slice(0, 5).forEach((item: any) => {
            console.log(`  - ${item.CreatedUtc}: ${item.Count} @ ${item.Amount?.Value || 0} ${item.Amount?.Currency || 'USD'} (State: ${item.State})`);
        });
    }
}

debugSync().catch(console.error);
