import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        // Total count
        const totalCount = await prisma.treeOrder.count();

        // Count by hotel
        const ordersByHotel = await prisma.treeOrder.groupBy({
            by: ['hotelId'],
            _count: true
        });

        // Get all hotels
        const hotels = await prisma.hotel.findMany();

        // Get sample orders
        const sampleOrders = await prisma.treeOrder.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
                hotel: true
            }
        });

        return NextResponse.json({
            totalCount,
            ordersByHotel,
            hotels: hotels.map(h => ({
                id: h.id,
                name: h.name,
                mewsId: h.mewsId,
                pmsType: h.pmsType
            })),
            sampleOrders: sampleOrders.map(o => ({
                id: o.id,
                mewsId: o.mewsId.slice(0, 20) + '...',
                hotelId: o.hotelId,
                hotelName: o.hotel.name,
                quantity: o.quantity,
                amount: o.amount,
                currency: o.currency,
                bookedAt: o.bookedAt,
                checkInAt: o.checkInAt, // Check-in date from reservation
                createdAt: o.createdAt
            }))
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
