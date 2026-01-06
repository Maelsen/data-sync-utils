import 'dotenv/config';
import { MewsClient } from '../lib/mews';

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';

async function debugProductsAPI() {
    console.log('Testing products/getAll API...\n');
    console.log(`Client token: ${CLIENT_TOKEN.slice(0, 8)}...`);
    console.log(`Access token: ${ACCESS_TOKEN.slice(0, 8)}...`);

    const mews = new MewsClient({
        clientToken: CLIENT_TOKEN,
        accessToken: ACCESS_TOKEN,
        clientName: 'Click A Tree Integration 1.0.0',
    });

    // Get configuration first
    console.log('\n--- Testing configuration/get ---');
    const config = await mews.getConfiguration();
    console.log('Configuration response:');
    console.log(JSON.stringify(config, null, 2));

    const serviceIds = config.Services?.map((s: any) => s.Id) || [];
    console.log(`\nService IDs: ${serviceIds.join(', ')}`);

    // Test products/getAll
    console.log('\n--- Testing products/getAll ---');
    const serviceId = process.env.TREE_SERVICE_ID || serviceIds[0];
    console.log(`Using serviceId: ${serviceId}`);

    const productsResponse = await mews.getProducts([serviceId]);
    console.log('\nProducts response:');
    console.log(JSON.stringify(productsResponse, null, 2));

    console.log(`\nTotal products: ${productsResponse.Products?.length || 0}`);
    if (productsResponse.Products?.length > 0) {
        console.log('\nProduct names:');
        productsResponse.Products.forEach((p: any) => {
            console.log(`  - ${p.Name} (ID: ${p.Id})`);
        });
    }
}

debugProductsAPI()
    .then(() => {
        console.log('\nDebug completed!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Debug failed:', err);
        console.error('Error details:', err.response?.data || err.message);
        process.exit(1);
    });
