import { NextResponse } from 'next/server';
import { syncTreeOrders } from '@/lib/sync';

export async function GET() {
    try {
        await syncTreeOrders();
        return NextResponse.json({ success: true, message: 'Sync completed' });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Sync failed' }, { status: 500 });
    }
}
