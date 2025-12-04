// Test endpoint to log ALL incoming requests
// GET/POST /api/test-webhook

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    const url = new URL(request.url);

    console.log('=== TEST WEBHOOK GET ===');
    console.log('URL:', request.url);
    console.log('Headers:', Object.fromEntries(request.headers));
    console.log('Search Params:', Object.fromEntries(url.searchParams));
    console.log('========================');

    return NextResponse.json({
        message: 'Test webhook GET received',
        url: request.url,
        timestamp: new Date().toISOString(),
    });
}

export async function POST(request: Request) {
    const url = new URL(request.url);
    const body = await request.text();

    console.log('=== TEST WEBHOOK POST ===');
    console.log('URL:', request.url);
    console.log('Headers:', Object.fromEntries(request.headers));
    console.log('Search Params:', Object.fromEntries(url.searchParams));
    console.log('Body:', body);
    console.log('=========================');

    return NextResponse.json({
        message: 'Test webhook POST received',
        url: request.url,
        bodyLength: body.length,
        timestamp: new Date().toISOString(),
    });
}
