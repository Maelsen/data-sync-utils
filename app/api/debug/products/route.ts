import { NextResponse } from 'next/server';
import { MewsClient } from '@/lib/mews';

/**
 * DEBUG ENDPOINT - Phase 1.1
 *
 * Zeigt alle Produkte aus der Mews API an.
 * Ändert NICHTS an der bestehenden Automatisation.
 *
 * Aufruf: GET /api/debug/products
 */

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';
const SERVICE_ID = process.env.MEWS_SERVICE_ID || '';

export async function GET() {
  try {
    console.log('[debug/products] Fetching all products from Mews API...');

    if (!CLIENT_TOKEN || !ACCESS_TOKEN) {
      return NextResponse.json({
        error: 'Missing Mews credentials',
        hint: 'Set MEWS_CLIENT_TOKEN and MEWS_ACCESS_TOKEN'
      }, { status: 500 });
    }

    const mews = new MewsClient({
      clientToken: CLIENT_TOKEN,
      accessToken: ACCESS_TOKEN,
      clientName: 'Click A Tree Debug 1.0.0',
    });

    // Hole alle Produkte
    const serviceIds = SERVICE_ID ? [SERVICE_ID] : [];
    const productsResponse: any = await mews.getProducts(serviceIds);

    const products = productsResponse.Products || [];

    console.log(`[debug/products] Found ${products.length} products`);

    // Formatiere für bessere Lesbarkeit
    const formattedProducts = products.map((p: any) => ({
      id: p.Id,
      names: p.Names,           // Lokalisierte Namen { "en-US": "...", "de-DE": "..." }
      externalNames: p.ExternalNames,
      shortNames: p.ShortNames,
      serviceId: p.ServiceId,
      isActive: p.IsActive,
      categoryId: p.CategoryId,
      // Hilfreich für die Suche:
      allNameValues: Object.values(p.Names || {}).join(' | '),
    }));

    // Suche nach potentiellen "Tree" Produkten (nur zur Info, ändert nichts)
    const potentialTreeProducts = formattedProducts.filter((p: any) => {
      const allNames = (p.allNameValues || '').toLowerCase();
      return allNames.includes('tree') ||
             allNames.includes('baum') ||
             allNames.includes('click');
    });

    return NextResponse.json({
      success: true,
      totalProducts: products.length,
      potentialTreeProducts: potentialTreeProducts.length,

      // Aktuelle Konfiguration (zum Vergleich)
      currentConfig: {
        TREE_PRODUCT_ID: process.env.TREE_PRODUCT_ID || '(nicht gesetzt)',
        TREE_PRODUCT_NAME: process.env.TREE_PRODUCT_NAME || '(nicht gesetzt)',
        MEWS_SERVICE_ID: SERVICE_ID || '(nicht gesetzt)',
      },

      // Potential matches (markiert)
      potentialMatches: potentialTreeProducts,

      // Alle Produkte
      allProducts: formattedProducts,
    });

  } catch (error: any) {
    console.error('[debug/products] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    }, { status: 500 });
  }
}
