# Voedingsdagboek

Offline web-app (PWA) voor een voedingsdagboek: check-ins op vaste tijden, mealprep-calculator, KPI's met grafieken en advies.

Live: https://pratikvlegel.github.io/lifestyle/

- Het dagboek, trainingsschema's en de optionele vergelijkingen van stemming met gewoontes blijven in de browseropslag op dit toestel. Wie toegang heeft tot dezelfde browseropslag kan die lokale gegevens ook openen. Je kan stemming, energie en optioneel stress/spanning registreren. De vergelijkingen gebruiken alleen ingevulde gestructureerde waarden; vrije notities worden niet gelezen. Ze tonen persoonlijke samenhang, geen oorzaak of diagnose. Bij een AI-verzoek stuurt de app rechtstreeks naar Anthropic je profiel (naam, geslacht, leeftijd, lengte, activiteitsniveau, context en doelen), je vraag en maximaal 21 dagen aan geregistreerde gegevens. Dit omvat kcal- en eiwittotalen per dag. Per maaltijd stuurt de app alleen het eetmoment, de omschrijving en (als beschikbaar) de kcal-schatting. Ook gewicht, slaap/CPAP, stemming, energie, stress, stappen, water, cafeïne, alcohol, nicotinevormen, frisdrank, zoetigheden en vrije notities kunnen meegaan. Activiteitsdetails, cyclusgegevens en supplementlogs worden niet in die AI-context opgenomen. Een gekozen etiketfoto wordt meegestuurd; bij Markdown-import worden maximaal 150.000 tekens verstuurd. Je eigen API-sleutel staat lokaal in de browser en wordt niet in back-ups opgenomen.
- Numerieke invoer wordt begrensd en waar nodig op gehele waarden gecontroleerd. Dagboekmetingen, maaltijdwaarden, etiketwaarden en zelf samengestelde oefeningen worden gevalideerd voordat ze worden opgeslagen.
- Zelf samengestelde oefeningen hebben een breed naamveld, optionele focus/uitleg en sets, herhalingen en rust op één regel. Via extra opties kun je ook een vasthoudtijd per herhaling en optioneel gewicht in kg vastleggen. De Bird dog-suggestie vult standaard 3 seconden vasthoudtijd in. Deze gegevens blijven behouden in actieve en bewaarde schema's en bij delen met de community. Je kunt communityoefeningen zoeken, beoordelen en in je eigen schema zetten. Een bewaarde communitykopie houdt alle trainingsweken en kan per week aangepast worden.
- Na het afvinken van een training kun je optioneel de werkelijke activiteit loggen met duur en ervaren intensiteit. De bewegings-KPI geeft dan een ruwe schatting op basis van activiteitstype, duur, intensiteit en geregistreerd lichaamsgewicht; die schatting gebruikt de sets en gewichten uit het schema niet en is geen meetwaarde.
- Producten, gedeelde mealprep-recepten, trainingsschema's, oefeningen en communitybeoordelingen gaan naar Supabase wanneer je ze deelt. Een vrije notitie bij je eigen mealprep-evaluatie blijft lokaal; openbare sterren en reacties zijn zichtbaar voor communityleden. Gedeelde trainingsschema's, oefeningsbeschrijvingen en de gekozen communitynaam zijn zichtbaar voor communityleden. Een beoordeling of reactie is alleen mogelijk op content van een ander lid. Receptfoto's staan in een openbare opslagbucket en zijn bereikbaar via hun afbeeldingslink. Bij het bekijken van gedeelde recepten laadt de app alleen afbeeldingen uit deze eigen Supabase-bucket en stuurt hij geen verwijzende app-URL mee. De gedeelde bibliotheek is alleen toegankelijk voor accounts die een uitnodiging hebben aanvaard.
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
| `js/cycle.js` | Optioneel lokaal cyclus- en symptoomdagboek met persoonlijke terugblik en ondersteunende adviezen; geen fase- of ovulatievoorspellingen |
| `js/app.js` | Schermen, check-ins, mealprep, instellingen |
| `js/training.js` | Offline trainingsplanner: afvallen/conditie, kracht/spiermassa, lopen, terugkeer na revalidatie, marathon en HYROX |
| `js/community-exercises.js` | Gedeelde oefenbibliotheek met zoekfilters, communityreviews en toevoegen aan eigen schema's |
| `js/library.js` | Productenbibliotheek, producteditor, eenheden, barcode |
| `js/ocr.js` | Gratis tekstherkenning van etiketten op het toestel |
| `js/cloud.js` | Gedeelde producten, recepten, beoordelingen en foto's via Supabase (anoniem account) |
| `ocr/` | Tesseract.js 5.1.1 + Nederlands taalmodel, ZXing 0.21.3 barcodelezer voor iPhone (Apache 2.0) |
| `supabase/schema.sql` | Tabel en beveiligingsregels van de gedeelde bibliotheek |
| `supabase/006_member_write_policies.sql` | Lidmaatschap vereist voor wijzigen en verwijderen van gedeelde gegevens |
| `supabase/007_community_schema_reviews.sql` | Communitynamen, gedeelde trainingsschema's en openbare beoordelingen/reacties |
| `supabase/012_community_exercises.sql` | Zoekbare community-oefenbibliotheek met filters, ledenbeoordelingen en lidmaatschapsregels |
| `supabase/013_exercise_hold_and_weight.sql` | Optionele houdduur en gewicht voor gedeelde oefeningen |
| `supabase/010_private_feedback_notes.sql` | Houdt vrije mealprep-notities afgeschermd van communityleden |
| `sw.js` | Service worker (offline). Verhoog `VERSION` bij elke update. |
| `manifest.webmanifest` | Installatie als app |

## Webpush-herinneringen

Webpush gebruikt per toestel een browserabonnement. Supabase bewaart het endpoint, de encryptiesleutels, tijdzone, taal en de ID's en tijden van actieve herinneringen. Om dubbele meldingen te voorkomen bewaart Supabase per herinnering ook de lokale datum en afleverstatus; statusregels ouder dan 14 dagen worden opgeruimd. Vrije herinneringsnamen, dagboek, stemming en gezondheidsgegevens blijven lokaal. De meldingstekst is algemeen. De gebruiker kan push per toestel uitschakelen; de agenda-export blijft beschikbaar.

De databasebasis staat in `supabase/008_web_push.sql`; de functie en de Supabase Cron-taak zijn actief. De cron controleert elke minuut op herinneringen en gebruikt de tijdzone van elk toestel. Een vertraging tot tien minuten wordt ingehaald; de afleverledger voorkomt dubbele meldingen per lokale dag. De cron-aanroep gebruikt de openbare project-publishable key plus de aparte `PUSH_CRON_SECRET`-header; de functie weigert verzoeken zonder die geheime header. De Edge Function staat zonder JWT-controle omdat Cron geen gebruikers-JWT heeft, maar controleert altijd de aparte geheime header. Geheimen staan alleen in Supabase Secrets/Vault, nooit in deze repository. Een gebruiker moet push nog per toestel inschakelen en browsertoestemming geven. Op iPhone/iPad is daarvoor een geïnstalleerde webapp nodig. Een geslaagde cronrun bevestigt dat de servertaak liep; aflevering op een toestel kan pas worden bevestigd zodra dat toestel is aangemeld. De functie verwerkt abonnementen in stabiele pagina's en heeft geen vaste limiet van 500 apparaten.

## Cyclusdagboek

Het cyclus- en symptoomdagboek is optioneel en blijft in de lokale browseropslag. Het wordt niet gesynchroniseerd met Supabase, niet gedeeld met de community en uitgesloten van AI-verzoeken. Een handmatige JSON-back-up bevat de cyclusgegevens. De app voorspelt geen menstruatie, ovulatie of vruchtbare dagen en geeft geen vaste trainings- of voedingsadviezen per cyclusfase. De persoonlijke samenvatting beschrijft alleen wat iemand zelf heeft geregistreerd.

`supabase/010_private_feedback_notes.sql` is toegepast op het Supabase-project om vrije feedbacknotities uit de selecteerbare communityvelden te halen. Nieuwe vrije notities worden lokaal bewaard; gestructureerde feedback en de expliciet openbare beoordeling/reactie blijven deelbaar.
