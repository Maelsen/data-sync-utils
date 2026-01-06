import 'dotenv/config';
import axios from 'axios';
import { subDays, addHours } from 'date-fns';

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';
const SERVICE_ID = process.env.TREE_SERVICE_ID || '';
const MEWS_API_URL = 'https://api.mews-demo.com/api/connector/v1';

async function debugOrderItems() {
    console.log('Testing orderitems/getAll API...\n');

    const lookbackDays = 30;
    const windowEnd = addHours(new Date(), 24);
    const windowStart = subDays(windowEnd, lookbackDays);

    console.log(`Fetching order items from ${windowStart.toISOString()} to ${windowEnd.toISOString()}\n`);

    // Try with ServiceIds
    const payloadWithService = {
        ClientToken: CLIENT_TOKEN,
        AccessToken: ACCESS_TOKEN,
        Client: 'Click A Tree Integration 1.0.0',
        ServiceIds: [SERVICE_ID],
        UpdatedUtc: {
            StartUtc: windowStart.toISOString(),
            EndUtc: windowEnd.toISOString()
        },
        Limitation: { Count: 100 }
    };

    console.log('Request WITH ServiceIds:');
    console.log(`ServiceIds: [${SERVICE_ID}]\n`);

    try {
        const response = await axios.post(
            `${MEWS_API_URL}/orderitems/getAll/2023-06-06`,
            payloadWithService
        );

        console.log('Order items response:');
        const orderItems = response.data.OrderItems || [];
        console.log(`Total order items: ${orderItems.length}`);

        if (orderItems.length > 0) {
            console.log('\nFirst 5 order items:');
            orderItems.slice(0, 5).forEach((oi: any) => {
                console.log(`  - Type: ${oi.Type}, ID: ${oi.Id}`);
                if (oi.Type === 'ProductOrder' && oi.Data?.Product) {
                    console.log(`    Product: ${oi.Data.Product.Name || 'N/A'} (ProductId: ${oi.Data.Product.ProductId})`);
                }
            });
        }

        // Try to find tree-related items
        const treeItems = orderItems.filter((oi: any) => {
            const productName = oi.Data?.Product?.Name || '';
            return productName.toLowerCase().includes('tree');
        });

        console.log(`\nTree-related items: ${treeItems.length}`);
        if (treeItems.length > 0) {
            console.log('Tree items:');
            treeItems.forEach((oi: any) => {
                console.log(`  - ${oi.Data.Product.Name} (ProductId: ${oi.Data.Product.ProductId})`);
            });
        }

    } catch (error: any) {
        console.error('API Error:', error.response?.data || error.message);
    }
}

debugOrderItems()
    .then(() => {
        console.log('\nDebug completed!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Debug failed:', err);
        process.exit(1);
    });
