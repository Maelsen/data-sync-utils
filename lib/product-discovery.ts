/**
 * Product Discovery Module
 *
 * Findet das Tree-Produkt automatisch anhand des Namens.
 * Unabhängig von der bestehenden Sync-Logik - kann separat getestet werden.
 *
 * Später als "Brücke" in sync-v3.ts eingebaut.
 */

import { MewsClient } from './mews';
import { subDays } from 'date-fns';

// Standard-Suchbegriffe für das Tree-Produkt
const TREE_SEARCH_TERMS = [
  'click a tree',
  'click-a-tree',
  'clickatree',
  'baum pflanzen',
  'plant a tree',
  'tree planting',
];

export interface DiscoveredProduct {
  id: string;
  name: string;
  names: Record<string, string>;
  serviceId: string;
  confidence: 'exact' | 'partial';
  matchedTerm: string;
}

export interface DiscoveryResult {
  success: boolean;
  product: DiscoveredProduct | null;
  allCandidates: DiscoveredProduct[];
  error?: string;
  stats: {
    orderItemsScanned: number;
    servicesChecked: number;
    productsFound: number;
    timeMs: number;
  };
}

/**
 * Sucht in allen Sprachen eines Produkts nach einem Begriff
 */
function matchesSearchTerm(names: Record<string, string>, searchTerm: string): boolean {
  const lowerTerm = searchTerm.toLowerCase();
  return Object.values(names).some(name =>
    name.toLowerCase().includes(lowerTerm)
  );
}

/**
 * Prüft ob ein Produktname exakt oder teilweise matched
 */
function getMatchConfidence(names: Record<string, string>, searchTerm: string): 'exact' | 'partial' | null {
  const lowerTerm = searchTerm.toLowerCase();

  for (const name of Object.values(names)) {
    const lowerName = name.toLowerCase();

    // Exakter Match: Der Suchbegriff ist der ganze Name oder eingeklammert
    if (lowerName === lowerTerm ||
        lowerName.includes(`(${lowerTerm})`) ||
        lowerName.includes(`[${lowerTerm}]`)) {
      return 'exact';
    }

    // Partial Match: Suchbegriff kommt irgendwo vor
    if (lowerName.includes(lowerTerm)) {
      return 'partial';
    }
  }

  return null;
}

/**
 * Hauptfunktion: Findet das Tree-Produkt automatisch
 *
 * @param mews - MewsClient Instanz
 * @param customSearchTerms - Optional: Eigene Suchbegriffe statt Standard
 * @returns DiscoveryResult mit gefundenem Produkt oder Fehlermeldung
 */
export async function discoverTreeProduct(
  mews: MewsClient,
  customSearchTerms?: string[]
): Promise<DiscoveryResult> {
  const startTime = Date.now();
  const searchTerms = customSearchTerms || TREE_SEARCH_TERMS;

  const stats = {
    orderItemsScanned: 0,
    servicesChecked: 0,
    productsFound: 0,
    timeMs: 0,
  };

  try {
    // SCHRITT 1: Hole OrderItems der letzten 90 Tage um ServiceIds zu finden
    const endDate = new Date();
    const startDate = subDays(endDate, 90);
    const updatedUtc = {
      StartUtc: startDate.toISOString(),
      EndUtc: endDate.toISOString(),
    };

    let allOrderItems: any[] = [];
    let cursor: string | undefined;
    let pageCount = 0;

    do {
      const data: any = await mews.getOrderItems([], updatedUtc, cursor);
      const items = data.OrderItems || [];
      allOrderItems.push(...items);
      cursor = data.Cursor;
      pageCount++;
      if (!cursor || cursor.trim() === '' || pageCount >= 5) break;
    } while (cursor);

    stats.orderItemsScanned = allOrderItems.length;

    // SCHRITT 2: Extrahiere ServiceIds aus OrderItems
    const serviceIdSet = new Set<string>();
    allOrderItems.forEach((oi: any) => {
      if (oi.Type === 'ProductOrder' && oi.ServiceId) {
        serviceIdSet.add(oi.ServiceId);
      }
    });

    const uniqueServiceIds = Array.from(serviceIdSet);
    stats.servicesChecked = uniqueServiceIds.length;

    // SCHRITT 3: Hole Products für jede ServiceId
    const allProducts: Array<{ id: string; names: Record<string, string>; serviceId: string }> = [];

    for (const serviceId of uniqueServiceIds) {
      try {
        const productsData: any = await mews.getProducts([serviceId]);
        const products = productsData.Products || [];

        products.forEach((p: any) => {
          allProducts.push({
            id: p.Id,
            names: p.Names || {},
            serviceId: serviceId,
          });
        });
      } catch (err) {
        // Service ohne Produkte ignorieren
      }
    }

    stats.productsFound = allProducts.length;

    // SCHRITT 4: Suche nach Tree-Produkten
    const candidates: DiscoveredProduct[] = [];

    for (const product of allProducts) {
      for (const term of searchTerms) {
        const confidence = getMatchConfidence(product.names, term);

        if (confidence) {
          const firstLang = Object.keys(product.names)[0];
          candidates.push({
            id: product.id,
            name: firstLang ? product.names[firstLang] : 'Unknown',
            names: product.names,
            serviceId: product.serviceId,
            confidence,
            matchedTerm: term,
          });
          break; // Ein Match pro Produkt reicht
        }
      }
    }

    stats.timeMs = Date.now() - startTime;

    // SCHRITT 5: Wähle bestes Ergebnis
    if (candidates.length === 0) {
      return {
        success: false,
        product: null,
        allCandidates: [],
        error: 'Kein Tree-Produkt gefunden. Bitte erstelle ein Produkt mit "Click A Tree" im Namen.',
        stats,
      };
    }

    // Sortiere: exact vor partial
    candidates.sort((a, b) => {
      if (a.confidence === 'exact' && b.confidence !== 'exact') return -1;
      if (b.confidence === 'exact' && a.confidence !== 'exact') return 1;
      return 0;
    });

    const bestMatch = candidates[0];

    return {
      success: true,
      product: bestMatch,
      allCandidates: candidates,
      stats,
    };

  } catch (error: any) {
    stats.timeMs = Date.now() - startTime;
    return {
      success: false,
      product: null,
      allCandidates: [],
      error: `Discovery fehlgeschlagen: ${error.message}`,
      stats,
    };
  }
}

/**
 * Hilfsfunktion: Gibt nur die ProductId zurück (für einfache Integration)
 */
export async function discoverTreeProductId(mews: MewsClient): Promise<string | null> {
  const result = await discoverTreeProduct(mews);
  return result.product?.id || null;
}
