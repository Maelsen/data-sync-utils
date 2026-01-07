import { NextResponse } from 'next/server';
import { MewsClient } from '@/lib/mews';
import axios from 'axios';

/**
 * DEBUG ENDPOINT - Phase 1.1 (Updated)
 *
 * Zeigt alle Services und Produkte aus der Mews API an.
 * SCHRITT 1: Services holen
 * SCHRITT 2: Mit ServiceIds die Products holen
 *
 * Ändert NICHTS an der bestehenden Automatisation.
 *
 * Aufruf: GET /api/debug/products
 */

const CLIENT_TOKEN = process.env.MEWS_CLIENT_TOKEN || '';
const ACCESS_TOKEN = process.env.MEWS_ACCESS_TOKEN || '';
const SERVICE_ID = process.env.MEWS_SERVICE_ID || '';
const MEWS_API_URL = 'https://api.mews-demo.com/api/connector/v1';

export async function GET() {
  try {
    console.log('[debug/products] Fetching services and products from Mews API...');

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

    // SCHRITT 1: Hole alle Services
    let services: any[] = [];
    try {
      const servicesResponse = await axios.post(`${MEWS_API_URL}/services/getAll`, {
        ClientToken: CLIENT_TOKEN,
        AccessToken: ACCESS_TOKEN,
        Client: 'Click A Tree Debug 1.0.0',
        Limitation: { Count: 100 }
      });
      services = servicesResponse.data.Services || [];
      console.log(`[debug/products] Found ${services.length} services`);
    } catch (err: any) {
      console.warn('[debug/products] services/getAll failed:', err.message);
    }

    // SCHRITT 2: Hole Products mit allen ServiceIds
    const allServiceIds = services.map((s: any) => s.Id);
    const serviceIdsToUse = SERVICE_ID ? [SERVICE_ID] : allServiceIds;

    let products: any[] = [];
    if (serviceIdsToUse.length > 0) {
      const productsResponse: any = await mews.getProducts(serviceIdsToUse);
      products = productsResponse.Products || [];
    }

    console.log(`[debug/products] Found ${products.length} products`);

    // Formatiere Services für Anzeige
    const formattedServices = services.map((s: any) => ({
      id: s.Id,
      name: s.Name,
      type: s.Type,
      isActive: s.IsActive,
    }));

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

      // Zusammenfassung
      totalServices: services.length,
      totalProducts: products.length,
      potentialTreeProducts: potentialTreeProducts.length,

      // Aktuelle Konfiguration (zum Vergleich)
      currentConfig: {
        TREE_PRODUCT_ID: process.env.TREE_PRODUCT_ID || '(nicht gesetzt)',
        TREE_PRODUCT_NAME: process.env.TREE_PRODUCT_NAME || 'tree',
        MEWS_SERVICE_ID: SERVICE_ID || '(nicht gesetzt)',
      },

      // Services (wichtig um ServiceId zu finden)
      services: formattedServices,

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
