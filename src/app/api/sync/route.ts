import { NextResponse } from 'next/server';
import { syncTreeOrdersV2 } from '@/lib/sync-v2';

export async function GET() {
    try {
        await syncTreeOrdersV2();
        return NextResponse.json({ success: true, message: 'Sync completed' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message || 'Sync failed' }, { status: 500 });
    }
}
