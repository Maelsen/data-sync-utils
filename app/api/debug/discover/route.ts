import { NextResponse } from 'next/server';
import { MewsClient } from '@/lib/mews';
import { discoverTreeProduct } from '@/lib/product-discovery';

/**
 * DEBUG ENDPOINT - Testet das neue Product Discovery Modul
 *
 * Aufruf: GET /api/debug/discover
 *
 * Nutzt die separate product-discovery.ts Funktion.
 * Ändert NICHTS an der bestehenden Automatisation.
 */

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';

export async function GET() {
  try {
    console.log('[debug/discover] Starting product discovery test...');

    if (!CLIENT_TOKEN || !ACCESS_TOKEN) {
      return NextResponse.json({
        error: 'Missing Mews credentials',
        hint: 'Set MEWS_CLIENT_TOKEN and MEWS_ACCESS_TOKEN'
      }, { status: 500 });
    }

    const mews = new MewsClient({
      clientToken: CLIENT_TOKEN,
      accessToken: ACCESS_TOKEN,
      clientName: 'Click A Tree Discovery Test 1.0.0',
    });

    // Nutze das neue Discovery-Modul
    const result = await discoverTreeProduct(mews);

    console.log(`[debug/discover] Discovery complete: ${result.success ? 'SUCCESS' : 'FAILED'}`);

    if (result.product) {
      console.log(`[debug/discover] Found: ${result.product.name} (${result.product.id})`);
    }

    return NextResponse.json({
      // Ergebnis des Discovery-Moduls
      ...result,

      // Aktuelle Konfiguration zum Vergleich
      currentConfig: {
        TREE_PRODUCT_ID: process.env.TREE_PRODUCT_ID || '(nicht gesetzt)',
        TREE_PRODUCT_NAME: process.env.TREE_PRODUCT_NAME || 'tree',
      },

      // Modul-Info
      module: 'lib/product-discovery.ts',
      endpoint: '/api/debug/discover',
    });

  } catch (error: any) {
    console.error('[debug/discover] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    }, { status: 500 });
  }
}
