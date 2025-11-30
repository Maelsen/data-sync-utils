import 'dotenv/config';
import { subDays } from 'date-fns';
import { MewsClient } from './lib/mews';

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN ?? '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN ?? '';

async function main() {
    console.log('Starte Verbindung zu Mews Demo...');

    const mews = new MewsClient({
        clientToken: CLIENT_TOKEN,
        accessToken: ACCESS_TOKEN,
    });

    try {
        console.log('Pruefe Konfiguration...');
        const config = await mews.getConfiguration();
        console.log('Verbunden mit Hotel:', config.Enterprise?.Name);

        const start = subDays(new Date(), 2).toISOString();
        const end = new Date().toISOString();

        console.log(`Suche Daten von ${start} bis ${end}...`);
        const data = await mews.getReservations(start, end);

        const products = data.Products || [];
        const tree = products.find((p: any) => (p.Name || '').toLowerCase().includes('tree'));

        if (tree) {
            console.log('\nBAUM PRODUKT GEFUNDEN:');
            console.log('Name:', tree.Name);
            console.log('Product ID:', tree.Id);
        } else {
            console.log('\nKein Produkt mit "tree" im Namen gefunden. Beispiele:');
            products.slice(0, 5).forEach((p: any) => console.log('- ' + p.Name));
        }

        const treeIds = tree ? [tree.Id] : [];
        const items = data.Items || [];
        const orderItems = data.OrderItems || [];
        const assignments = data.ProductAssignments || [];

        const soldTrees = items.filter((i: any) => treeIds.includes(i.ProductId));
        const soldOrderItems = orderItems.filter((i: any) => treeIds.includes(i.ProductId));
        const soldAssignments = assignments.filter((i: any) => treeIds.includes(i.ProductId));

        console.log(`\nItems: ${soldTrees.length}, OrderItems: ${soldOrderItems.length}, Assignments: ${soldAssignments.length}`);
        console.log('Sample Item:', soldTrees[0]);
        console.log('Sample OrderItem:', soldOrderItems[0]);
        console.log('Sample Assignment:', soldAssignments[0]);
    } catch (e: any) {
        console.error('Fehler:', e.response?.data || e.message);
    }
}

main();
