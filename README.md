# Voedingsdagboek

Offline web-app (PWA) voor een voedingsdagboek: check-ins op vaste tijden, mealprep-calculator, KPI's met grafieken en advies.

Live: https://pratikvlegel.github.io/lifestyle/

- Geen server, geen account. Alle gegevens blijven in de browser op het toestel (localStorage).
- In deze repo staat alleen code. **Zet hier nooit een back-up of importbestand (.json) met persoonlijke gegevens.**

## Structuur

| Bestand | Wat |
|---|---|
| `index.html` | Opmaak en schermindeling |
| `js/store.js` | Datamodel, opslag, berekeningen |
| `js/charts.js` | SVG-grafieken (zonder externe bibliotheken) |
| `js/insights.js` | Offline advies, optionele AI-analyse |
| `js/app.js` | Schermen, check-ins, mealprep, instellingen |
| `sw.js` | Service worker (offline). Verhoog `VERSION` bij elke update. |
| `manifest.webmanifest` | Installatie als app |
