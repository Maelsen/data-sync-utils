import { NextResponse } from 'next/server';
import { MewsClient } from '@/lib/mews';
import { subDays } from 'date-fns';

/**
 * DEBUG ENDPOINT - Phase 1.1 (v3)
 *
 * Extrahiert Produkte aus OrderItems (weil products/getAll in Demo leer ist)
 * Die OrderItems enthalten Data.Product.Name + Data.Product.ProductId
 *
 * Ändert NICHTS an der bestehenden Automatisation.
 *
 * Aufruf: GET /api/debug/products
 */

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';

export async function GET() {
  try {
    console.log('[debug/products] Extracting products from OrderItems...');

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

    // Hole OrderItems der letzten 90 Tage
    const endDate = new Date();
    const startDate = subDays(endDate, 90);

    const updatedUtc = {
      StartUtc: startDate.toISOString(),
      EndUtc: endDate.toISOString(),
    };

    console.log(`[debug/products] Fetching orderitems from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    let allOrderItems: any[] = [];
    let cursor: string | undefined;
    let pageCount = 0;

    do {
      const data: any = await mews.getOrderItems([], updatedUtc, cursor);
      const items = data.OrderItems || [];
      allOrderItems.push(...items);
      cursor = data.Cursor;
      pageCount++;

      console.log(`[debug/products] Page ${pageCount}: ${items.length} items (total: ${allOrderItems.length})`);

      if (!cursor || cursor.trim() === '') break;
    } while (cursor && pageCount < 10); // Max 10 pages

    console.log(`[debug/products] Total OrderItems: ${allOrderItems.length}`);

    // Extrahiere eindeutige Produkte aus OrderItems
    const productMap = new Map<string, any>();

    allOrderItems.forEach((oi: any) => {
      if (oi.Type === 'ProductOrder' && oi.Data?.Product) {
        const productId = oi.Data.Product.ProductId;
        const productName = oi.Data.Product.Name || 'Unknown';

        if (!productMap.has(productId)) {
          productMap.set(productId, {
            id: productId,
            name: productName,
            serviceId: oi.ServiceId,
            orderCount: 1,
          });
        } else {
          productMap.get(productId).orderCount++;
        }
      }
    });

    const uniqueProducts = Array.from(productMap.values());
    console.log(`[debug/products] Found ${uniqueProducts.length} unique products`);

    // Suche nach potentiellen "Tree" Produkten
    const potentialTreeProducts = uniqueProducts.filter((p: any) => {
      const name = (p.name || '').toLowerCase();
      return name.includes('tree') ||
             name.includes('baum') ||
             name.includes('click');
    });

    return NextResponse.json({
      success: true,

      // Zusammenfassung
      totalOrderItems: allOrderItems.length,
      totalUniqueProducts: uniqueProducts.length,
      potentialTreeProducts: potentialTreeProducts.length,

      // Aktuelle Konfiguration (zum Vergleich)
      currentConfig: {
        TREE_PRODUCT_ID: process.env.TREE_PRODUCT_ID || '(nicht gesetzt)',
        TREE_PRODUCT_NAME: process.env.TREE_PRODUCT_NAME || 'tree',
      },

      // WICHTIG: Potentielle Tree-Matches
      potentialMatches: potentialTreeProducts,

      // Alle gefundenen Produkte (sortiert nach orderCount)
      allProducts: uniqueProducts.sort((a, b) => b.orderCount - a.orderCount),
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
