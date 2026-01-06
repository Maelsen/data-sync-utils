import dotenv from 'dotenv';
import { prisma } from '../lib/prisma';

// Load .env.production explicitly
dotenv.config({ path: '.env.production' });

async function checkOrders() {
    console.log('Checking database for TreeOrders...\n');

    // Total count
    const totalCount = await prisma.treeOrder.count();
    console.log(`Total TreeOrders in database: ${totalCount}\n`);

    // Count by hotel
    const ordersByHotel = await prisma.treeOrder.groupBy({
        by: ['hotelId'],
        _count: true
    });
    console.log('TreeOrders by hotelId:');
    ordersByHotel.forEach(group => {
        console.log(`  hotelId ${group.hotelId}: ${group._count} orders`);
    });
    console.log();

    // Get all hotels
    const hotels = await prisma.hotel.findMany();
    console.log('Hotels in database:');
    hotels.forEach(hotel => {
        console.log(`  [${hotel.id}] ${hotel.name} (mewsId: ${hotel.mewsId}, pmsType: ${hotel.pmsType})`);
    });
    console.log();

    // Get sample orders
    const sampleOrders = await prisma.treeOrder.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
            hotel: true
        }
    });

    console.log('Sample of most recent orders:');
    sampleOrders.forEach(order => {
        console.log(`  [${order.id}] mewsId: ${order.mewsId.slice(0, 16)}... qty: ${order.quantity}, hotel: ${order.hotel.name}`);
    });

    await prisma.$disconnect();
}

checkOrders()
    .then(() => {
        console.log('\nCheck completed!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Check failed:', err);
        process.exit(1);
    });
