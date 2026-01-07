import { NextResponse } from 'next/server';
import { MewsClient } from '@/lib/mews';
import { subDays } from 'date-fns';

/**
 * DEBUG ENDPOINT - Phase 1.1 (v4)
 *
 * Workaround für Demo-Umgebung:
 * 1. OrderItems holen → ServiceIds + ProductIds extrahieren
 * 2. products/getAll mit ServiceIds → Namen bekommen
 * 3. Namen mit ProductIds matchen
 *
 * Ändert NICHTS an der bestehenden Automatisation.
 *
 * Aufruf: GET /api/debug/products
 */

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';

export async function GET() {
  try {
    console.log('[debug/products] Starting product discovery...');

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

    // SCHRITT 1: Hole OrderItems der letzten 90 Tage
    const endDate = new Date();
    const startDate = subDays(endDate, 90);

    const updatedUtc = {
      StartUtc: startDate.toISOString(),
      EndUtc: endDate.toISOString(),
    };

    console.log(`[debug/products] Step 1: Fetching orderitems...`);

    let allOrderItems: any[] = [];
    let cursor: string | undefined;
    let pageCount = 0;

    do {
      const data: any = await mews.getOrderItems([], updatedUtc, cursor);
      const items = data.OrderItems || [];
      allOrderItems.push(...items);
      cursor = data.Cursor;
      pageCount++;

      if (!cursor || cursor.trim() === '') break;
    } while (cursor && pageCount < 10);

    console.log(`[debug/products] Found ${allOrderItems.length} orderitems`);

    // Extrahiere ProductIds und ServiceIds aus OrderItems
    const productOrderMap = new Map<string, { serviceId: string; orderCount: number }>();

    allOrderItems.forEach((oi: any) => {
      if (oi.Type === 'ProductOrder' && oi.Data?.Product?.ProductId) {
        const productId = oi.Data.Product.ProductId;
        const serviceId = oi.ServiceId;

        if (!productOrderMap.has(productId)) {
          productOrderMap.set(productId, { serviceId, orderCount: 1 });
        } else {
          productOrderMap.get(productId)!.orderCount++;
        }
      }
    });

    console.log(`[debug/products] Found ${productOrderMap.size} unique product IDs in orders`);

    // SCHRITT 2: Hole alle eindeutigen ServiceIds
    const uniqueServiceIds = [...new Set(
      Array.from(productOrderMap.values()).map(v => v.serviceId)
    )];

    console.log(`[debug/products] Step 2: Fetching products for ${uniqueServiceIds.length} services...`);

    // SCHRITT 3: Hole Products für jede ServiceId
    const productNameMap = new Map<string, { name: string; names: any }>();

    for (const serviceId of uniqueServiceIds) {
      try {
        const productsData: any = await mews.getProducts([serviceId]);
        const products = productsData.Products || [];

        products.forEach((p: any) => {
          // Extrahiere den ersten verfügbaren Namen
          const names = p.Names || {};
          const firstLang = Object.keys(names)[0];
          const name = firstLang ? names[firstLang] : 'Unknown';

          productNameMap.set(p.Id, { name, names });
        });

        console.log(`[debug/products] Service ${serviceId.slice(0, 8)}...: ${products.length} products`);
      } catch (err: any) {
        console.warn(`[debug/products] Failed to get products for service ${serviceId}: ${err.message}`);
      }
    }

    console.log(`[debug/products] Total products with names: ${productNameMap.size}`);

    // SCHRITT 4: Kombiniere OrderItems-Daten mit Produkt-Namen
    const combinedProducts = Array.from(productOrderMap.entries()).map(([productId, orderData]) => {
      const productInfo = productNameMap.get(productId);
      return {
        id: productId,
        name: productInfo?.name || 'Unknown',
        names: productInfo?.names || {},
        serviceId: orderData.serviceId,
        orderCount: orderData.orderCount,
      };
    });

    // SCHRITT 5: Suche nach "Tree" Produkten
    const potentialTreeProducts = combinedProducts.filter((p: any) => {
      const name = (p.name || '').toLowerCase();
      const allNames = Object.values(p.names || {}).join(' ').toLowerCase();
      return name.includes('tree') ||
             name.includes('baum') ||
             name.includes('click') ||
             allNames.includes('tree') ||
             allNames.includes('baum') ||
             allNames.includes('click');
    });

    return NextResponse.json({
      success: true,

      // Zusammenfassung
      totalOrderItems: allOrderItems.length,
      totalUniqueProducts: productOrderMap.size,
      productsWithNames: productNameMap.size,
      potentialTreeProducts: potentialTreeProducts.length,

      // Aktuelle Konfiguration
      currentConfig: {
        TREE_PRODUCT_ID: process.env.TREE_PRODUCT_ID || '(nicht gesetzt)',
        TREE_PRODUCT_NAME: process.env.TREE_PRODUCT_NAME || 'tree',
      },

      // WICHTIG: Tree-Matches
      potentialMatches: potentialTreeProducts,

      // Alle Produkte (sortiert nach orderCount)
      allProducts: combinedProducts.sort((a, b) => b.orderCount - a.orderCount),
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
