import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        // Only count trees from non-canceled orders (amount > 0)
        const totalTrees = await prisma.treeOrder.aggregate({
            _sum: { quantity: true },
            where: {
                amount: { gt: 0 }
            }
        });

        const recentOrders = await prisma.treeOrder.findMany({
            take: 10,
            orderBy: { bookedAt: 'desc' },
            include: { hotel: true },
        });

        const invoices = await prisma.invoice.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: { hotel: true },
        });

        return NextResponse.json({
            totalTrees: totalTrees._sum.quantity || 0,
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
