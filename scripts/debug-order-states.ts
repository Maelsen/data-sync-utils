import 'dotenv/config';
import { MewsClient } from '../lib/mews';
import { subDays, addHours } from 'date-fns';

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';

async function debugOrderStates() {
    console.log('Checking OrderItem States from Mews API...\n');

    const mews = new MewsClient({
        clientToken: CLIENT_TOKEN,
        accessToken: ACCESS_TOKEN,
        clientName: 'Click A Tree Debug 1.0.0',
    });

    // Get recent order items
    const lookbackDays = 7; // Last week
    const windowEnd = addHours(new Date(), 24);
    const windowStart = subDays(windowEnd, lookbackDays);

    console.log(`Fetching orders from ${windowStart.toISOString()} to ${windowEnd.toISOString()}\n`);

    const data = await mews.getOrderItems(
        [],
        { StartUtc: windowStart.toISOString(), EndUtc: windowEnd.toISOString() }
    );

    const orderItems = data.OrderItems || [];
    console.log(`Total order items: ${orderItems.length}\n`);

    // Group by State
    const stateGroups: { [key: string]: any[] } = {};
    orderItems.forEach((oi: any) => {
        const state = oi.State || 'Unknown';
        if (!stateGroups[state]) {
            stateGroups[state] = [];
        }
        stateGroups[state].push(oi);
    });

    console.log('Order items grouped by State:\n');
    Object.keys(stateGroups).forEach(state => {
        console.log(`  ${state}: ${stateGroups[state].length} orders`);
    });

    // Group by AccountingState
    const accountingStateGroups: { [key: string]: any[] } = {};
    orderItems.forEach((oi: any) => {
        const accState = oi.AccountingState || 'Unknown';
        if (!accountingStateGroups[accState]) {
            accountingStateGroups[accState] = [];
        }
        accountingStateGroups[accState].push(oi);
    });

    console.log('\n\nOrder items grouped by AccountingState:\n');
    Object.keys(accountingStateGroups).forEach(state => {
        console.log(`  ${state}: ${accountingStateGroups[state].length} orders`);
    });

    console.log('\n\nSample orders by AccountingState:\n');
    Object.keys(accountingStateGroups).forEach(state => {
        console.log(`\n=== AccountingState: ${state} (${accountingStateGroups[state].length} total) ===`);
        const samples = accountingStateGroups[state].slice(0, 5);
        samples.forEach((oi: any, idx: number) => {
            console.log(`  [${idx + 1}] ID: ${oi.Id.slice(0, 20)}...`);
            console.log(`      Type: ${oi.Type}`);
            console.log(`      State: ${oi.State}`);
            console.log(`      AccountingState: ${oi.AccountingState || 'N/A'}`);
            console.log(`      Amount: ${oi.UnitAmount?.GrossValue || 0} ${oi.UnitAmount?.Currency || 'N/A'}`);
            console.log(`      ConsumedUtc: ${oi.ConsumedUtc || 'N/A'}`);
            console.log(`      ClosedUtc: ${oi.ClosedUtc || 'N/A'}`);
            console.log(`      CanceledUtc: ${oi.CanceledUtc || 'N/A'}`);
            console.log(`      Created: ${oi.CreatedUtc}`);
            if (oi.Data?.Product) {
                console.log(`      Product: ${oi.Data.Product.Name || 'N/A'} (${oi.Data.Product.ProductId})`);
            }
        });
    });
}

debugOrderStates()
    .then(() => {
        console.log('\n\nDebug completed!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Debug failed:', err);
        process.exit(1);
    });
