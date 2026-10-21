# Prosty Geoportal

Roboczo: prostygeoportal.pl. Niezależna, lekka aplikacja mapowa dla osób, które chcą szybko sprawdzić działkę: granice, numer, przeznaczenie w planie, ceny w okolicy, uzbrojenie, ortofotomapę aktualną i archiwalną. Interfejs w stylu map konsumenckich, dane na żywo z usług GUGiK (geoportal.gov.pl).

Projekt open source na licencji MIT, tworzony przez [EnviroSolutions](https://envirosolutions.pl).

## Uruchomienie

Wymagany Node.js 22.18 lub nowszy (serwer to TypeScript uruchamiany bezpośrednio przez Node, bez transpilacji).

```bash
npm install
npm run dev
```

Aplikacja: http://localhost:5173, API: http://localhost:8787. Front i API można też uruchomić osobno: `npm run dev:web` i `npm run dev:api`.

Odświeżenie cache metadanych usług (GetCapabilities):

```bash
npm run capabilities
```

Produkcja: `npm run build` (buduje aplikację i zapisuje skompresowane kopie `.br`/`.gz`), potem `NODE_ENV=production npm start` serwuje aplikację i API. Zmienne środowiskowe: `PORT` (8787), `HOST` (`0.0.0.0` w produkcji, `127.0.0.1` poza nią), `TRUSTED_PROXY=1`, gdy przed serwerem stoi reverse proxy ustawiające `X-Forwarded-For` (limity zapytań liczą się wtedy per adres klienta, nie per proxy).

## Architektura

- `src/` aplikacja: React 19, TypeScript, OpenLayers 10 z widokiem w EPSG:2180, Tailwind CSS.
- `src/services/registry.ts` rejestr usług GUGiK: jedno miejsce, z którego powstają warstwy, katalog i atrybucja.
- `server/` lekki backend (Hono): cache metadanych usług, słowniki do wyszukiwarki działek (województwa, powiaty, gminy, obręby) z cache na dysku i pośrednik GetFeatureInfo. Bez bazy danych.
- `public/thumbs/` miniatury podkładów: po jednym kaflu z każdej usługi, zmniejszonym do 128 px.
- `scripts/precompress.ts` kompresja zbudowanych plików po `vite build`.

## Bezpieczeństwo API

API nie ma kont ani danych użytkowników. Zabezpieczenia:

- `/api/featureinfo/:service` przyjmuje tylko usługi z rejestru, a każdy parametr jest walidowany i budowany na nowo (warstwy ze znanej listy, BBOX liczbowy, rozmiary do 4096 px, do 50 obiektów). Przekierowania usług GUGiK są śledzone po stronie serwera tylko na publiczne hosty (adresy rozwiązywane i sprawdzane względem sieci prywatnych) na portach 80, 443, 8080 i 8443. Odpowiedź jest czytana do 1 MB z jednym limitem czasu na cały łańcuch i zwracana jako zwykły tekst.
- `/api/dict/...` przyjmuje kod tylko wtedy, gdy występuje na liście nadrzędnej (powiat musi istnieć w województwie itd.), więc cache na dysku nie rośnie od zmyślonych identyfikatorów. Puste odpowiedzi nie trafiają na dysk.
- Limity zapytań per adres (token bucket w pamięci) na słownikach i GetFeatureInfo, limit równoległych zapytań do usług źródłowych.
- `POST /api/capabilities/refresh` działa tylko z tej samej maszyny i wymaga nagłówka `X-Refresh: capabilities`.
- Nagłówki: Content Security Policy (skrypty tylko własne, obrazy map z dowolnego hosta https, połączenia tylko do usług GUGiK), `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Błędy usług źródłowych są logowane na serwerze, a klient dostaje jedno ogólne zdanie.

## Dane

Wszystkie dane pochodzą z usług sieciowych Głównego Urzędu Geodezji i Kartografii oraz serwerów starostw i gmin, z którymi te usługi się łączą. Aplikacja pobiera je na bieżąco i nie przechowuje ich. Źródło: geoportal.gov.pl. Informacje mają charakter poglądowy i nie są dokumentem urzędowym.
