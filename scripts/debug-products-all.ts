import 'dotenv/config';
import axios from 'axios';

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';
const MEWS_API_URL = 'https://api.mews-demo.com/api/connector/v1';

async function debugProductsAll() {
    console.log('Testing products/getAll WITHOUT ServiceIds...\n');

    // Try WITHOUT ServiceIds to get ALL products
    const payload = {
        ClientToken: CLIENT_TOKEN,
        AccessToken: ACCESS_TOKEN,
        Client: 'Click A Tree Integration 1.0.0',
        IncludeDefault: true,
        Limitation: { Count: 1000 }
        // NO ServiceIds!
    };

    console.log('Request payload:');
    console.log(JSON.stringify(payload, null, 2));

    try {
        const response = await axios.post(`${MEWS_API_URL}/products/getAll`, payload);

        console.log('\nProducts response:');
        console.log(JSON.stringify(response.data, null, 2));

        const products = response.data.Products || [];
        console.log(`\nTotal products: ${products.length}`);

        if (products.length > 0) {
            console.log('\nProduct names:');
            products.forEach((p: any) => {
                console.log(`  - ${p.Name} (ID: ${p.Id}, ServiceId: ${p.ServiceId || 'N/A'})`);
            });
        }
    } catch (error: any) {
        console.error('API Error:', error.response?.data || error.message);
    }
}

debugProductsAll()
    .then(() => {
        console.log('\nDebug completed!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Debug failed:', err);
        process.exit(1);
    });
