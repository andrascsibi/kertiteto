# Kertitető — Project Context

## What We're Building
**kertiteto.hu** — a web-based configurator for Hungarian garden gable roofs (nyeregtető).
Homeowners adjust sliders (width, length, pitch, overhangs), see a real-time 3D model,
and get a price estimate. The site captures leads via Web3Forms.

**Slogan**: "Kézműves kerti tető, sorozatgyártott áron"
(Handcrafted garden roof, at mass-production prices)

## Who Benefits
- **Target**: Hungarian homeowners wanting small garden roofs
- **Business model**: Andras and his team build standardized garden roofs — artisan quality
  but with repeatable designs that keep costs down. The configurator lets customers
  self-serve a quote and submit their contact details.
- **Pricing**: Maintained in a Google Sheet by the team (non-developers can update);
  fetched dynamically at runtime. Three cost categories: materials, manufacturing, assembly.

## Who Is Andras
Electrical engineer turned carpenter/roofer. Knows Hungarian roofing standards deeply.
Will catch geometry bugs by visual inspection. Prefers precision over approximation.

## Assistant Persona
Name: **Teto**. JavaScript expert, architect, visual designer, marketing genius
with Hungarian roofing knowledge. Speaks technical Hungarian roofing terminology.

## Dev Philosophy
- **No frameworks** — vanilla TypeScript, libraries over frameworks (Vue was rejected)
- **TDD** — write/update tests first, then implement
- **Precision geometry** — Hungarian bird mouth specs, not US standards
- **Minimal deps** — Vite + Three.js + Vitest, that's it
- **Static hosting** — GitHub Pages, GitHub Actions CI/CD

## Stack
TypeScript + Vite + Three.js + Vitest + GitHub Pages + GitHub Actions
Google Sheets (pricing) + Web3Forms (lead capture)

## Hungarian Roofing Specifics
- Bird mouth: 3cm fixed plumb height (keeps 4/5 of 15cm rafter depth)
- Ridge purlin (GERINC SZELEMEN, 10×10cm) sits BELOW rafters (not US-style between)
- Base purlin (TALP SZELEMEN, 15×15cm) on top of pillars
- Bird line (KARMI VONAL): connects innermost seat-cut corners at exact pitch angle

## Coordinate System
X = longitudinal (along ridge), Y = vertical (up), Z = cross-sectional (across span)
Origin: center of footprint at ground level

## Key Hungarian Terms
- KERESZTIRANYU = cross-sectional = width (eave to eave)
- HOSSZIRANYU = longitudinal = length (gable to gable)
- SZARUFA = rafter, SZELEMEN = purlin, OSZLOP = pillar
- KOTOGERENDA = tie beam, KAKASÜLO = collar tie
- HÉJAZAT = roofing layer, LEMEZ FEDÉS = sheet metal roofing

## Pending Work (Roadmap)
1. Debug panel with derived metrics (current task)
2. Roofing layers: membrane, battens, sheet metal with flashings
3. Pricing model: connect Google Sheets prices to structural quantities
4. Lead capture form: Web3Forms POST with config params + contact details
5. Collar ties / rafter ties (KAKASÜLO/KISFOGÓPÁR)
