import 'dotenv/config';
import { addHours, subDays } from 'date-fns';
import { prisma } from './prisma';
import { MewsClient } from './mews';

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';
const TREE_NAME = (process.env.TREE_PRODUCT_NAME || 'tree').toLowerCase();

function toNumber(value: any, fallback = 0) {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function toDate(value: any) {
    const d = value ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime()) ? d : new Date();
}

export async function syncTreeOrdersV2() {
    console.log('[sync] start');
    console.log(`[sync] client token: ${CLIENT_TOKEN.slice(0, 8)}...`);
    console.log(`[sync] access token: ${ACCESS_TOKEN.slice(0, 8)}...`);

    if (!CLIENT_TOKEN || !ACCESS_TOKEN) {
        throw new Error('Missing Mews credentials (MEWS_CLIENT_TOKEN / MEWS_ACCESS_TOKEN)');
    }

    const mews = new MewsClient({
        clientToken: CLIENT_TOKEN,
        accessToken: ACCESS_TOKEN,
    });

    const lookbackDays = 30;
    const windowHours = 96; // API limit is 100h

    const windowEnd = addHours(new Date(), 24); // look slightly ahead so today's upsells are included
    let cursor = subDays(windowEnd, lookbackDays);

    const allItems: any[] = [];
    const allOrderItems: any[] = [];
    const allAssignments: any[] = [];
    const productMap = new Map<string, any>();
    let enterprise: any = null;

    while (cursor < windowEnd) {
        const chunkStart = cursor;
        const chunkEndDate = addHours(cursor, windowHours);
        const chunkEnd = chunkEndDate > windowEnd ? windowEnd : chunkEndDate;

        console.log(`[sync] fetch ${chunkStart.toISOString()} -> ${chunkEnd.toISOString()}`);

        let pageCursor: string | undefined;
        do {
            const data = await mews.getReservations(chunkStart.toISOString(), chunkEnd.toISOString(), pageCursor);

            if (!enterprise && data.Enterprise) {
                enterprise = data.Enterprise;
            }

            (data.Items || []).forEach((i: any) => allItems.push(i));
            (data.OrderItems || []).forEach((i: any) => allOrderItems.push(i));
            (data.ProductAssignments || []).forEach((p: any) => allAssignments.push(p));
            (data.Products || []).forEach((p: any) => productMap.set(p.Id, p));

            pageCursor = data.Cursor;
            if (pageCursor) {
                console.log('[sync]   cursor -> next page');
            }
        } while (pageCursor);

        cursor = chunkEnd;
    }

    const products = Array.from(productMap.values());
    console.log(
        `[sync] collected ${allItems.length} Items, ${allOrderItems.length} OrderItems, ${allAssignments.length} ProductAssignments, ${products.length} products`,
    );

    const treeProducts = products.filter((p: any) => (p.Name || '').toLowerCase().includes(TREE_NAME));
    const treeProductIds = treeProducts.map((p: any) => p.Id);
    console.log(`[sync] tree products: ${treeProducts.map((p: any) => p.Name).join(', ') || 'none'}`);

    const treeItems = allItems.filter((item: any) => treeProductIds.includes(item.ProductId));
    const treeOrderItems = allOrderItems.filter((item: any) => treeProductIds.includes(item.ProductId));
    const treeAssignments = allAssignments.filter((item: any) => treeProductIds.includes(item.ProductId));

    const treeLines = [
        ...treeItems.map((item: any) => ({
            mewsId: item.Id,
            quantity: toNumber(item.Count, 1),
            amount: toNumber(item.Amount?.Value ?? item.AmountBeforeTaxes?.Value, 0),
            currency: item.Amount?.Currency || item.AmountBeforeTaxes?.Currency || 'EUR',
            bookedAt: toDate(item.ConsumptionUtc || item.CreatedUtc),
        })),
        ...treeOrderItems.map((item: any) => ({
            mewsId: item.Id,
            quantity: toNumber(item.Count, 1),
            amount: toNumber(item.Amount?.Value ?? item.TotalPrice?.Value, 0),
            currency: item.Amount?.Currency || item.TotalPrice?.Currency || 'EUR',
            bookedAt: toDate(item.CreatedUtc),
        })),
        ...treeAssignments.map((item: any) => ({
            mewsId: item.Id,
            quantity: toNumber(item.Count, 1),
            amount: toNumber(item.Amount?.Value ?? item.Price?.Value, 0),
            currency: item.Amount?.Currency || item.Price?.Currency || 'EUR',
            bookedAt: toDate(item.StartUtc || item.CreatedUtc),
        })),
    ];

    console.log(`[sync] tree lines total: ${treeLines.length}`);

    if (treeLines.length === 0) {
        console.log('[sync] no tree sales found in window');
        return;
    }

    const hotelId = enterprise?.Id || 'demo-hotel';
    const hotelName = enterprise?.Name || 'Mews Demo Hotel';

    const hotel = await prisma.hotel.upsert({
        where: { mewsId: hotelId },
        update: { name: hotelName },
        create: { mewsId: hotelId, name: hotelName },
    });

    for (const line of treeLines) {
        await prisma.treeOrder.upsert({
            where: { mewsId: line.mewsId },
            update: {
                hotelId: hotel.id,
                quantity: line.quantity,
                amount: line.amount,
                currency: line.currency,
                bookedAt: line.bookedAt,
            },
            create: {
                mewsId: line.mewsId,
                hotelId: hotel.id,
                quantity: line.quantity,
                amount: line.amount,
                currency: line.currency,
                bookedAt: line.bookedAt,
            },
        });
    }

    console.log('[sync] saved tree orders to database');
}
