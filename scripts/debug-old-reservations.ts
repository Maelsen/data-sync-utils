import 'dotenv/config';
import { MewsClient } from '../lib/mews';
import { subDays, addHours } from 'date-fns';

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';

async function debugOldReservations() {
    console.log('Testing old reservations/getAll API...\n');

    const mews = new MewsClient({
        clientToken: CLIENT_TOKEN,
        accessToken: ACCESS_TOKEN,
        clientName: 'Click A Tree Integration 1.0.0',
    });

    const lookbackDays = 30;
    const windowEnd = addHours(new Date(), 24);
    const windowStart = subDays(windowEnd, lookbackDays);

    console.log(`Fetching reservations from ${windowStart.toISOString()} to ${windowEnd.toISOString()}\n`);

    try {
        const data = await mews.getReservations(
            windowStart.toISOString(),
            windowEnd.toISOString()
        );

        console.log('Reservations API response keys:');
        console.log(Object.keys(data));

        console.log('\nReservations:', data.Reservations?.length || 0);
        console.log('Products:', data.Products?.length || 0);
        console.log('Items:', data.Items?.length || 0);
        console.log('OrderItems:', data.OrderItems?.length || 0);
        console.log('ProductAssignments:', data.ProductAssignments?.length || 0);

        if (data.Products && data.Products.length > 0) {
            console.log('\nProducts found:');
            data.Products.forEach((p: any) => {
                console.log(`  - ${p.Name} (ID: ${p.Id})`);
            });
        }

        if (data.Items && data.Items.length > 0) {
            console.log('\nItems found:');
            data.Items.slice(0, 5).forEach((i: any) => {
                console.log(`  - ${i.Name || i.Type} (ID: ${i.Id})`);
            });
            if (data.Items.length > 5) {
                console.log(`  ... and ${data.Items.length - 5} more`);
            }
        }

        if (data.OrderItems && data.OrderItems.length > 0) {
            console.log('\nOrderItems found:');
            data.OrderItems.slice(0, 5).forEach((oi: any) => {
                console.log(`  - ${oi.Name || oi.Type} (ID: ${oi.Id})`);
            });
            if (data.OrderItems.length > 5) {
                console.log(`  ... and ${data.OrderItems.length - 5} more`);
            }
        }

    } catch (error: any) {
        console.error('API Error:', error.response?.data || error.message);
    }
}

debugOldReservations()
    .then(() => {
        console.log('\nDebug completed!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Debug failed:', err);
        process.exit(1);
    });
