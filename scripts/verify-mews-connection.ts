
import 'dotenv/config';
import { MewsClient } from '../lib/mews';

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';

async function verifyConnection() {
    console.log('Verifying Mews Connection...');
    console.log(`Client Token: ${CLIENT_TOKEN.slice(0, 8)}...`);
    console.log(`Access Token: ${ACCESS_TOKEN.slice(0, 8)}...`);

    if (!CLIENT_TOKEN || !ACCESS_TOKEN) {
        console.error('ERROR: Missing credentials in .env');
        process.exit(1);
    }

    const mews = new MewsClient({
        clientToken: CLIENT_TOKEN,
        accessToken: ACCESS_TOKEN,
        clientName: 'Click A Tree Integration 1.0.0'
    });

    try {
        console.log('Fetching configuration (simple read test)...');
        const config = await mews.getConfiguration();
        console.log('SUCCESS! Connected to Mews.');
        console.log('Configuration summary:', JSON.stringify(config, null, 2).slice(0, 200) + '...');

        console.log('\nFetching reservations (checking Client param acceptance)...');
        // Just fetch a small window to verify the request format is accepted
        const now = new Date();
        const startUtc = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(); // 24h ago
        const endUtc = now.toISOString();

        const reservations = await mews.getReservations(startUtc, endUtc);
        console.log(`SUCCESS! Fetched ${reservations.Reservations?.length || 0} reservations.`);

    } catch (error: any) {
        console.error('FAILED to connect:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
        process.exit(1);
    }
}

verifyConnection();
