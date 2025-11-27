import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
    const totalTrees = await prisma.treeOrder.aggregate({
        _sum: { quantity: true },
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
}
