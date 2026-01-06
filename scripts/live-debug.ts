import 'dotenv/config';
import { MewsClient } from '../lib/mews';
import { addHours, subDays } from 'date-fns';

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';

async function liveDebug() {
    console.log('=== LIVE DEBUG - Checking Mews API RIGHT NOW ===\n');

    const mews = new MewsClient({
        clientToken: CLIENT_TOKEN,
        accessToken: ACCESS_TOKEN,
        clientName: 'Click A Tree Integration 1.0.0',
    });

    // Get last 2 hours of data
    const now = new Date();
    const start = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const end = addHours(now, 2);

    console.log(`Fetching from ${start.toISOString()} to ${end.toISOString()}\n`);

    const data = await mews.getReservations(start.toISOString(), end.toISOString());

    console.log(`Total Items from API: ${data.Items?.length || 0}`);
    console.log(`Total Products from API: ${data.Products?.length || 0}\n`);

    // Find tree product
    const treeProduct = (data.Products || []).find((p: any) =>
        p.Id === 'ff7f1d18-eb3a-47d2-a723-b3a2013d3ce0' ||
        (p.Name || '').toLowerCase().includes('tree')
    );

    if (!treeProduct) {
        console.log('❌ NO TREE PRODUCT FOUND!');
        return;
    }

    console.log(`✅ Tree Product: "${treeProduct.Name}" (ID: ${treeProduct.Id})\n`);

    // Find all tree items
    const treeItems = (data.Items || []).filter((item: any) =>
        item.ProductId === treeProduct.Id
    );

    console.log(`Tree Items Found: ${treeItems.length}\n`);

    if (treeItems.length === 0) {
        console.log('❌ NO TREE ITEMS IN LAST 2 HOURS!');
        console.log('This means either:');
        console.log('  1. No orders were made');
        console.log('  2. Orders are not yet in Mews API');
        console.log('  3. Orders have different ConsumptionUtc time\n');
    } else {
        console.log('Tree Items Details:');
        treeItems.forEach((item: any, idx: number) => {
            const qtyMatch = item.Name?.match(/^(\d+)\s*×/);
            const qty = qtyMatch ? qtyMatch[1] : (item.Count || '?');

            console.log(`\n[${idx + 1}] ID: ${item.Id}`);
            console.log(`    Name: "${item.Name}"`);
            console.log(`    Quantity: ${qty}`);
            console.log(`    Amount: ${item.Amount?.Value || 0} ${item.Amount?.Currency || 'USD'}`);
            console.log(`    State: ${item.State}`);
            console.log(`    ConsumptionUtc: ${item.ConsumptionUtc}`);
            console.log(`    CreatedUtc: ${item.CreatedUtc}`);
        });
    }
}

liveDebug().catch(console.error);
