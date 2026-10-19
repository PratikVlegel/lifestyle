# Voedingsdagboek

Offline web-app (PWA) voor een voedingsdagboek: check-ins op vaste tijden, mealprep-calculator, KPI's met grafieken en advies.

Live: https://pratikvlegel.github.io/lifestyle/

- Het dagboek blijft in de browser op het toestel (localStorage).
- Alleen producten (naam, merk, barcode, etiketwaarden) gaan naar de gedeelde bibliotheek in Supabase.
- In deze repo staat alleen code. **Zet hier nooit een back-up of importbestand (.json) met persoonlijke gegevens.**

## Structuur

| Bestand | Wat |
|---|---|
| `index.html` | Opmaak en schermindeling |
| `js/config.js` | Supabase-adres en publishable key (mag openbaar, RLS beschermt de databank) |
| `js/store.js` | Datamodel, opslag, berekeningen |
| `js/charts.js` | SVG-grafieken (zonder externe bibliotheken) |
| `js/insights.js` | Offline advies, optionele AI-analyse |
| `js/app.js` | Schermen, check-ins, mealprep, instellingen |
| `js/library.js` | Productenbibliotheek, producteditor, eenheden, barcode |
| `js/ocr.js` | Gratis tekstherkenning van etiketten op het toestel |
| `js/cloud.js` | Gedeelde productenbibliotheek via Supabase (anoniem account) |
| `ocr/` | Tesseract.js 5.1.1 + Nederlands taalmodel, ZXing 0.21.3 barcodelezer voor iPhone (Apache 2.0) |
| `supabase/schema.sql` | Tabel en beveiligingsregels van de gedeelde bibliotheek |
| `sw.js` | Service worker (offline). Verhoog `VERSION` bij elke update. |
| `manifest.webmanifest` | Installatie als app |
