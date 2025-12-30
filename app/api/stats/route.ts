import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        // Only count trees from non-canceled orders (amount > 0)

        // MODIFICATION: Calculate trees based on amount (approx 5.90 per tree) because
        // Mews might send "1 item" for a package of trees.
        const aggregations = await prisma.treeOrder.aggregate({
            _sum: { amount: true },
            where: {
                amount: { gt: 0 }
            }
        });

        const totalRevenue = aggregations._sum.amount || 0;
        const totalTrees = Math.round(totalRevenue / 5.9);

        const recentOrdersRaw = await prisma.treeOrder.findMany({
            take: 10,
            orderBy: { bookedAt: 'desc' },
            include: { hotel: true },
        });

        const recentOrders = recentOrdersRaw.map(order => ({
            ...order,
            quantity: Math.round((order.amount || 0) / 5.9) || order.quantity
        }));

        const invoices = await prisma.invoice.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: { hotel: true },
        });

        return NextResponse.json({
            totalTrees: totalTrees || 0,
            recentOrders,
            invoices,
        });
    } catch (error: any) {
        console.error('Stats API Error:', error);
        return NextResponse.json({
            error: error.message,
            totalTrees: 0,
            recentOrders: [],
            invoices: []
        }, { status: 500 });
    }
}
