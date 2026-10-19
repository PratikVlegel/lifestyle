# Voedingsdagboek

Offline web-app (PWA) voor een voedingsdagboek: check-ins op vaste tijden, mealprep-calculator, KPI's met grafieken en advies.

Live: https://pratikvlegel.github.io/lifestyle/

- Het dagboek, trainingsschema's en de optionele vergelijkingen van stemming met gewoontes blijven op het toestel (localStorage). Je kan stemming, energie en optioneel stress/spanning registreren. De vergelijkingen gebruiken alleen ingevulde gestructureerde waarden; vrije notities worden niet gelezen. Ze tonen persoonlijke samenhang, geen oorzaak of diagnose. Als je zelf een AI-analyse start, verstuurt de app je profiel en maximaal 21 dagen relevante dagboekgegevens, inclusief notities, naar Anthropic.
- Numerieke invoer wordt begrensd en waar nodig op gehele waarden gecontroleerd. Dagboekmetingen, maaltijdwaarden, etiketwaarden en zelf samengestelde oefeningen worden gevalideerd voordat ze worden opgeslagen.
- Producten, gedeelde mealprep-recepten en communitybeoordelingen gaan naar Supabase wanneer je ze deelt. Gedeelde trainingsschema's en de gekozen communitynaam zijn zichtbaar voor communityleden. Een beoordeling of reactie is alleen mogelijk op content van een ander lid. Receptfoto's staan in een openbare opslagbucket en zijn bereikbaar via hun afbeeldingslink. De gedeelde bibliotheek is alleen toegankelijk voor accounts die een uitnodiging hebben aanvaard.
- In deze repo staat alleen code. **Zet hier nooit een back-up of importbestand (.json) met persoonlijke gegevens.**

## Structuur

| Bestand | Wat |
|---|---|
| `index.html` | Opmaak en schermindeling |
| `js/config.js` | Supabase-adres en publishable key (mag openbaar, RLS beschermt de databank) |
| `js/store.js` | Datamodel, opslag, berekeningen |
| `js/charts.js` | SVG-grafieken (zonder externe bibliotheken) |
| `js/insights.js` | Offline advies, optionele AI-analyse |
| `js/mood.js` | Opt-in, lokale vergelijkingen van stemming met geregistreerde gewoontes en bronnen voor onderbouwde adviezen |
| `js/app.js` | Schermen, check-ins, mealprep, instellingen |
| `js/training.js` | Offline trainingsplanner: afvallen/conditie, kracht/spiermassa, lopen, terugkeer na revalidatie, marathon en HYROX |
| `js/library.js` | Productenbibliotheek, producteditor, eenheden, barcode |
| `js/ocr.js` | Gratis tekstherkenning van etiketten op het toestel |
| `js/cloud.js` | Gedeelde producten, recepten, beoordelingen en foto's via Supabase (anoniem account) |
| `ocr/` | Tesseract.js 5.1.1 + Nederlands taalmodel, ZXing 0.21.3 barcodelezer voor iPhone (Apache 2.0) |
| `supabase/schema.sql` | Tabel en beveiligingsregels van de gedeelde bibliotheek |
| `supabase/006_member_write_policies.sql` | Lidmaatschap vereist voor wijzigen en verwijderen van gedeelde gegevens |
| `supabase/007_community_schema_reviews.sql` | Communitynamen, gedeelde trainingsschema's en openbare beoordelingen/reacties |
| `sw.js` | Service worker (offline). Verhoog `VERSION` bij elke update. |
| `manifest.webmanifest` | Installatie als app |
