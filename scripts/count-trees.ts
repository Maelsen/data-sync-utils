import { prisma } from '../lib/prisma';

async function countTrees() {
    const result = await prisma.treeOrder.aggregate({
        _sum: { quantity: true }
    });

    console.log('Total trees in database:', result._sum.quantity);

    // Also show all orders
    const allOrders = await prisma.treeOrder.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            mewsId: true,
            quantity: true,
            amount: true,
            currency: true,
            bookedAt: true,
            createdAt: true,
        }
    });

    console.log(`\nAll ${allOrders.length} orders:`);
    allOrders.forEach((o, i) => {
        console.log(`  [${i+1}] Qty: ${o.quantity}, Amount: ${o.amount} ${o.currency}, Booked: ${o.bookedAt.toISOString().split('T')[0]}, MewsId: ${o.mewsId.substring(0, 10)}...`);
    });
}

countTrees().then(() => process.exit(0)).catch(console.error);
