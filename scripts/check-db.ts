import { prisma } from '../lib/prisma';

async function checkDb() {
    const allOrders = await prisma.treeOrder.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
            id: true,
            mewsId: true,
            quantity: true,
            amount: true,
            currency: true,
            createdAt: true,
            bookedAt: true,
        }
    });

    console.log('Latest 10 orders in database:');
    allOrders.forEach((o, i) => {
        console.log(`  [${i+1}] Created: ${o.createdAt.toISOString()}, Booked: ${o.bookedAt.toISOString().split('T')[0]}, Qty: ${o.quantity}, Amount: ${o.amount} ${o.currency}, MewsId: ${o.mewsId.slice(0, 8)}...`);
    });

    // Check for today's order specifically
    const todayOrder = await prisma.treeOrder.findMany({
        where: {
            mewsId: '5e57f7d6-9372-4dfa-af75-b3ca00ceab41'
        }
    });

    console.log('\nLooking for todays order (5e57f7d6-9372-4dfa-af75-b3ca00ceab41):');
    if (todayOrder.length > 0) {
        console.log('✅ FOUND:', todayOrder[0]);
    } else {
        console.log('❌ NOT FOUND in database');
    }
}

checkDb().then(() => process.exit(0)).catch(console.error);
