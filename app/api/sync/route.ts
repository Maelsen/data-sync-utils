import { NextResponse } from 'next/server';
import { syncTreeOrdersV2 } from '@/lib/sync-v2'; // WICHTIG: v2 importieren

export async function GET() {
    try {
        await syncTreeOrdersV2(); // V2 aufrufen
        return NextResponse.json({ success: true, message: 'Sync V2 completed' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
