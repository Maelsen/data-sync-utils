import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        // 1. Create Hotel
        const hotel = await prisma.hotel.upsert({
            where: { mewsId: 'test-hotel-123' },
            update: {},
            create: {
                mewsId: 'test-hotel-123',
                name: 'Grand Hotel München',
            },
        });

        // 2. Add some orders
        const now = new Date();
        const createdOrders = [];

        for (let i = 0; i < 8; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() - i * 3); // Spread over last 3 weeks

            const order = await prisma.treeOrder.create({
                data: {
                    mewsId: `test-order-${Date.now()}-${i}`,
                    hotelId: hotel.id,
                    quantity: Math.floor(Math.random() * 4) + 1, // 1-4 trees
                    amount: (Math.floor(Math.random() * 4) + 1) * 5.0, // 5-20 EUR
                    currency: 'EUR',
                    bookedAt: date,
                },
            });
            createdOrders.push(order);
        }

        return NextResponse.json({
            success: true,
            message: `Created hotel "${hotel.name}" and ${createdOrders.length} test orders`,
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
