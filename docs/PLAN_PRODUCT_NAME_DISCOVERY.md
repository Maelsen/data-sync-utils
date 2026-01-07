# Plan: Product Discovery by Name (ohne ID)

## Ziel
Hotels sollen nur ein Produkt mit standardisiertem Namen erstellen.
Wir finden die Product ID automatisch - kein manueller ID-Austausch nötig.

## Wichtig: Keine Breaking Changes!
- Die aktuelle Automatisation bleibt 100% unverändert
- Wir bauen alles "nebenher" als Debug-/Test-Features
- Erst wenn alles funktioniert, bauen wir die Brücke ein

---

## Phase 1: Debug-Endpoint (Produkte anzeigen)
**Ziel:** Sehen was die API zurückgibt

### Schritt 1.1: Neuer Debug-Endpoint
- [ ] Erstelle `/api/debug/products/route.ts`
- [ ] Ruft `products/getAll` auf (wie jetzt schon)
- [ ] Gibt ALLE Produkte als JSON zurück
- [ ] Zeigt: `Id`, `Names`, `ExternalNames`, `IsActive`, `ServiceId`

### Schritt 1.2: Test
- [ ] Endpoint manuell aufrufen: `GET /api/debug/products`
- [ ] Produkte inspizieren - wie sieht der "Baum" aus?

---

## Phase 2: UI-Anzeige (Produkte in Tabelle)
**Ziel:** Produkte visuell sehen ohne Code zu ändern

### Schritt 2.1: Button in Hotel-Dashboard
- [ ] "Show Products" Button hinzufügen (nur Debug)
- [ ] Öffnet Modal/Section mit Produkt-Liste

### Schritt 2.2: Produkt-Tabelle
- [ ] Zeigt alle Produkte: Name | ID | ServiceId | Active
- [ ] Markiert potentielle "Tree" Matches farblich

---

## Phase 3: Filterlogik testen
**Ziel:** Algorithmus entwickeln der den Baum findet

### Schritt 3.1: Analyse
- [ ] Wie heißt das Tree-Produkt genau?
- [ ] Welche Sprachen sind in `Names`?
- [ ] Gibt es ähnliche Namen die verwirren könnten?

### Schritt 3.2: Filter-Funktion
- [ ] Separate Funktion `findTreeProductByName(products)`
- [ ] Prüft alle Sprachen in `Names`
- [ ] Gibt `{ id, name, confidence }` zurück
- [ ] Testen mit echten Daten

### Schritt 3.3: Edge Cases
- [ ] Was wenn 0 Matches? → Error + Anleitung
- [ ] Was wenn mehrere Matches? → Warning + ersten nehmen
- [ ] Case-insensitive Suche

---

## Phase 4: Die Brücke bauen
**Ziel:** Automatische ID-Discovery wenn keine ID konfiguriert

### Schritt 4.1: Brücke in sync-v3.ts
```typescript
// VORHER (Zeile 74):
const targetProductId = process.env.TREE_PRODUCT_ID;

// NACHHER (Brücke):
let targetProductId = process.env.TREE_PRODUCT_ID;
if (!targetProductId) {
  // Fallback: Suche nach Namen
  const discovered = findTreeProductByName(allProducts);
  if (discovered) {
    targetProductId = discovered.id;
    console.log(`[sync-v3] Auto-discovered tree product: ${discovered.name} (${discovered.id})`);
  }
}
```

### Schritt 4.2: Validierung
- [ ] Mit TREE_PRODUCT_ID → funktioniert wie immer
- [ ] Ohne TREE_PRODUCT_ID → findet automatisch
- [ ] Beides getestet und dokumentiert

---

## Aktueller Status

| Phase | Status | Notizen |
|-------|--------|---------|
| Phase 1: Debug-Endpoint | ⏳ TODO | - |
| Phase 2: UI-Anzeige | ⏳ TODO | - |
| Phase 3: Filterlogik | ⏳ TODO | - |
| Phase 4: Brücke | ⏳ TODO | - |

---

## Nächster Schritt
**Phase 1.1:** Debug-Endpoint `/api/debug/products` erstellen
