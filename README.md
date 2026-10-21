# Prosty Geoportal

Roboczo: prostygeoportal.pl. Niezależna, lekka aplikacja mapowa dla osób, które chcą szybko sprawdzić działkę: granice, numer, przeznaczenie w planie, ceny w okolicy, uzbrojenie, ortofotomapę aktualną i archiwalną. Interfejs w stylu map konsumenckich, dane na żywo z usług GUGiK (geoportal.gov.pl).

Projekt open source na licencji MIT, tworzony przez [EnviroSolutions](https://envirosolutions.pl).

## Uruchomienie

Wymagany Node.js 22 lub nowszy.

```bash
npm install
npm run dev
```

Aplikacja: http://localhost:5173, API: http://localhost:8787. Front i API można też uruchomić osobno: `npm run dev:web` i `npm run dev:api`.

Odświeżenie cache metadanych usług (GetCapabilities):

```bash
npm run capabilities
```

Produkcja: `npm run build`, potem `NODE_ENV=production npm start` serwuje aplikację i API na porcie 8787.

## Architektura

- `src/` aplikacja: React 19, TypeScript, OpenLayers 10 z widokiem w EPSG:2180, Tailwind CSS.
- `src/services/registry.ts` rejestr usług GUGiK: jedno miejsce, z którego powstają warstwy, katalog i atrybucja.
- `server/` lekki backend (Hono): cache metadanych usług, słowniki do wyszukiwarki działek (województwa, powiaty, gminy, obręby) z cache na dysku i pośrednik GetFeatureInfo. Bez bazy danych.

## Dane

Wszystkie dane pochodzą z usług sieciowych Głównego Urzędu Geodezji i Kartografii oraz serwerów starostw i gmin, z którymi te usługi się łączą. Aplikacja pobiera je na bieżąco i nie przechowuje ich. Źródło: geoportal.gov.pl. Informacje mają charakter poglądowy i nie są dokumentem urzędowym.
