# Voedingsdagboek

Offline web-app (PWA) voor een voedingsdagboek: check-ins op vaste tijden, mealprep-calculator, KPI's met grafieken en advies.

Live: https://pratikvlegel.github.io/lifestyle/

- Het dagboek, trainingsschema's en de optionele vergelijkingen van stemming met gewoontes blijven in de browseropslag op dit toestel. Wie toegang heeft tot dezelfde browseropslag kan die lokale gegevens ook openen. Je kan stemming, energie en optioneel stress/spanning registreren. De vergelijkingen gebruiken alleen ingevulde gestructureerde waarden; vrije notities worden niet gelezen. Ze tonen persoonlijke samenhang, geen oorzaak of diagnose. Bij een AI-verzoek stuurt de app rechtstreeks naar Anthropic je profiel (naam, geslacht, leeftijd, lengte, activiteitsniveau, context en doelen), je vraag en maximaal 21 dagen aan geregistreerde gegevens. Dat kan maaltijden en voedingswaarden, gewicht, slaap/CPAP, stemming, energie, stress, stappen, water, cafeïne, alcohol, vapen en vrije notities omvatten. Een gekozen etiketfoto wordt meegestuurd; bij Markdown-import worden maximaal 150.000 tekens verstuurd. Je eigen API-sleutel staat lokaal in de browser en wordt niet in back-ups opgenomen.
- Numerieke invoer wordt begrensd en waar nodig op gehele waarden gecontroleerd. Dagboekmetingen, maaltijdwaarden, etiketwaarden en zelf samengestelde oefeningen worden gevalideerd voordat ze worden opgeslagen.
- Zelf samengestelde oefeningen hebben een breed naamveld, optionele focus/uitleg en sets, herhalingen en rust op één regel. De focus blijft behouden bij opslaan en delen.
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

## Webpush-herinneringen

Webpush gebruikt per toestel een browserabonnement. Supabase bewaart het endpoint, de encryptiesleutels, tijdzone, taal en alleen herinnerings-ID's en -tijden. Vrije herinneringsnamen, dagboek, stemming en gezondheidsgegevens blijven lokaal. De meldingstekst is algemeen. De gebruiker kan push per toestel uitschakelen; de agenda-export blijft beschikbaar.

De databasebasis staat in `supabase/008_web_push.sql` en de Edge Function `send-reminders` is aangemaakt in het Supabase-project. Push staat nog niet actief: hiervoor zijn VAPID- en cron-geheimen nodig en moet een Supabase Cron-taak worden ingesteld. Zet geheimen alleen in Supabase Secrets/Vault, nooit in deze repository. De function controleert naast de Supabase JWT ook de eigen `PUSH_CRON_SECRET`-header. Voer de cron-taak pas in nadat deze geheimen zijn ingesteld en de endpoint-authenticatie is nagekeken.
