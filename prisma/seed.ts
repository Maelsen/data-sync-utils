import { PrismaClient } from '@prisma/client';
import { subDays } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding database...');

    // 1. Create a Mock Hotel
    const hotel = await prisma.hotel.upsert({
        where: { mewsId: 'mock-hotel-123' },
        update: {},
        create: {
            mewsId: 'mock-hotel-123',
            name: 'Grand Hotel Test',
        },
    });

    console.log(`Created hotel: ${hotel.name}`);

    // 2. Create Mock Tree Orders (last 30 days)
    const orders = [];
    for (let i = 0; i < 10; i++) {
        orders.push({
            mewsId: `order-${i}`,
            hotelId: hotel.id,
            quantity: Math.floor(Math.random() * 5) + 1, // 1-5 trees
            amount: 5.0, // 5 EUR per tree
            currency: 'EUR',
            bookedAt: subDays(new Date(), i), // Spread over last 10 days
        });
    }

    for (const order of orders) {
        await prisma.treeOrder.upsert({
            where: { mewsId: order.mewsId },
            update: {},
            create: order,
        });
    }

    console.log(`Seeded ${orders.length} orders.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
