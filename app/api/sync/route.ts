import { NextResponse } from 'next/server';
import { syncTreeOrdersV3 } from '@/lib/sync-v3'; // NEW: v3 with orderitems/getAll

export async function GET() {
    try {
        await syncTreeOrdersV3(); // V3 with new API endpoints
        return NextResponse.json({ success: true, message: 'Sync V3 completed' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
