import 'dotenv/config';
import axios from 'axios';
import { subDays, addHours } from 'date-fns';

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';
const MEWS_API_URL = 'https://api.mews-demo.com/api/connector/v1';

async function debugOrderItemsNoService() {
    console.log('Testing orderitems/getAll WITHOUT ServiceIds...\n');

    const lookbackDays = 30;
    const windowEnd = addHours(new Date(), 24);
    const windowStart = subDays(windowEnd, lookbackDays);

    console.log(`Fetching order items from ${windowStart.toISOString()} to ${windowEnd.toISOString()}\n`);

    // Try WITHOUT ServiceIds
    const payload = {
        ClientToken: CLIENT_TOKEN,
        AccessToken: ACCESS_TOKEN,
        Client: 'Click A Tree Integration 1.0.0',
        UpdatedUtc: {
            StartUtc: windowStart.toISOString(),
            EndUtc: windowEnd.toISOString()
        },
        Limitation: { Count: 100 }
        // NO ServiceIds!
    };

    console.log('Request WITHOUT ServiceIds\n');

    try {
        const response = await axios.post(
            `${MEWS_API_URL}/orderitems/getAll/2023-06-06`,
            payload
        );

        console.log('Order items response:');
        const orderItems = response.data.OrderItems || [];
        console.log(`Total order items: ${orderItems.length}`);

        if (orderItems.length > 0) {
            console.log('\nFirst 10 order items:');
            orderItems.slice(0, 10).forEach((oi: any, index: number) => {
                console.log(`\n[${index + 1}] Type: ${oi.Type}, ID: ${oi.Id}`);
                if (oi.Type === 'ProductOrder' && oi.Data?.Product) {
                    console.log(`    Product: ${oi.Data.Product.Name || 'N/A'}`);
                    console.log(`    ProductId: ${oi.Data.Product.ProductId}`);
                    console.log(`    ServiceId: ${oi.ServiceId || 'N/A'}`);
                    console.log(`    UnitCount: ${oi.UnitCount}`);
                    console.log(`    Amount: ${oi.UnitAmount?.GrossValue} ${oi.UnitAmount?.Currency}`);
                }
            });
        }

        // Try to find tree-related items
        const treeItems = orderItems.filter((oi: any) => {
            const productName = (oi.Data?.Product?.Name || '').toLowerCase();
            return productName.includes('tree') || productName.includes('click');
        });

        console.log(`\n\nTree-related items found: ${treeItems.length}`);
        if (treeItems.length > 0) {
            console.log('\nTree items:');
            treeItems.forEach((oi: any) => {
                console.log(`  - ${oi.Data.Product.Name}`);
                console.log(`    ProductId: ${oi.Data.Product.ProductId}`);
                console.log(`    ServiceId: ${oi.ServiceId || 'N/A'}`);
                console.log(`    Amount: ${oi.UnitAmount?.GrossValue} ${oi.UnitAmount?.Currency}\n`);
            });
        }

    } catch (error: any) {
        console.error('API Error:', error.response?.data || error.message);
    }
}

debugOrderItemsNoService()
    .then(() => {
        console.log('\nDebug completed!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Debug failed:', err);
        process.exit(1);
    });
