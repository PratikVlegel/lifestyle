# Voedingsdagboek

Offline web-app (PWA) voor een voedingsdagboek: check-ins op vaste tijden, mealprep-calculator, KPI's met grafieken en advies.

Live: https://pratikvlegel.github.io/lifestyle/

- Het dagboek blijft standaard in de browser op het toestel (localStorage). Gebruik je AI, dan stuurt de app de gegevens die nodig zijn voor die actie naar Anthropic.
- Producten, gedeelde mealprep-recepten en beoordelingen gaan naar Supabase wanneer je ze deelt. Receptfoto's staan in een openbare opslagbucket en zijn bereikbaar via hun afbeeldingslink.
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
| `js/training.js` | Offline basisweek en meerweeks marathon- en HYROX-programma |
| `js/library.js` | Productenbibliotheek, producteditor, eenheden, barcode |
| `js/ocr.js` | Gratis tekstherkenning van etiketten op het toestel |
| `js/cloud.js` | Gedeelde producten, recepten, beoordelingen en foto's via Supabase (anoniem account) |
| `ocr/` | Tesseract.js 5.1.1 + Nederlands taalmodel, ZXing 0.21.3 barcodelezer voor iPhone (Apache 2.0) |
| `supabase/schema.sql` | Tabel en beveiligingsregels van de gedeelde bibliotheek |
| `supabase/006_member_write_policies.sql` | Lidmaatschap vereist voor wijzigen en verwijderen van gedeelde gegevens |
| `sw.js` | Service worker (offline). Verhoog `VERSION` bij elke update. |
| `manifest.webmanifest` | Installatie als app |
