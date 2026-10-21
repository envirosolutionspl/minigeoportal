# Prosty Geoportal

Roboczo: prostygeoportal.pl. Niezależna, lekka aplikacja mapowa dla osób, które chcą szybko sprawdzić działkę: granice, numer, przeznaczenie w planie, ceny w okolicy, uzbrojenie, ortofotomapę aktualną i archiwalną. Interfejs w stylu map konsumenckich, dane na żywo z usług GUGiK (geoportal.gov.pl).

Projekt open source na licencji MIT, tworzony przez [EnviroSolutions](https://envirosolutions.pl).

## Funkcje

- Wyszukiwarka adresów, ulic, miejscowości, gmin, powiatów, województw i obiektów fizjograficznych (rzeki, jeziora, szczyty) oraz osobna wyszukiwarka działek z listami województw, powiatów, gmin i obrębów. Źródła: geokoder UUG, indeks pełnotekstowy geoportalu (miejscowości i obiekty z PRNG, miasta przed wsiami), listy PRG z cache serwera. Jednostki są pokazywane z obrysem z PRG (uogólnionym, kilkadziesiąt KB), a obiekty fizjograficzne jako punkty, bo PRNG nie ma ich obrysów: rzeka to szereg punktów wzdłuż biegu.
- Podkłady: ortofotomapa, mapa BDOO + BDOT10k (domyślna na komputerze), mapa uproszczona (domyślna na telefonie), mapa terenu, skany, brak podkładu.
- Warstwy: ewidencja gruntów i budynków, plany miejscowe i ogólne, ceny transakcyjne, uzbrojenie terenu, z wyborem pojedynczych warstw i przezroczystości.
- Informacje o klikniętym miejscu (GetFeatureInfo) i link do raportu o działce z geoportal.gov.pl (dane ewidencyjne, mapy, eksport do PDF).
- Pomiar odległości i powierzchni (geodezyjnie, na elipsoidzie) i współrzędne kursora w PL-1992 oraz WGS 84.
- Wydruk w skali 1:500–1:2 500 000 na A4 lub A3 z tytułem, legendą i źródłami, także jako PDF przez okno drukowania przeglądarki.
- Formularz zgłaszania błędów wysyłany e-mailem do administratora.
- Dostępność WCAG 2.1 AA: obsługa klawiaturą, czytniki ekranu, tryb ciemny, ograniczenie ruchu, deklaracja dostępności w oknie informacyjnym.

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

Testy (Vitest): `npm test`, w trybie ciągłym `npm run test:watch`. Testy leżą obok kodu: `server/*.test.ts` działają w Node i sprawdzają walidację, filtr przekierowań, limity, słowniki, parser capabilities, formularz zgłoszeń i trasy API; `src/**/*.test.ts(x)` działają w jsdom i sprawdzają parser odpowiedzi, wyszukiwarkę, stan mapy, adres URL, rejestr usług, pomiar, wydruk i komponenty. `src/ui/a11y.test.tsx` sprawdza komponenty regułami WCAG 2.1 A/AA biblioteki axe-core. Kontrastu nie da się sprawdzić w jsdom: kolory z palety mają co najmniej 4,5:1 w obu motywach (tekst pomocniczy 5,4:1, akcent 6,2:1, tryb ciemny 6:1). Każda nowa funkcja lub poprawka ma mieć test w tym samym commicie.

Produkcja: `npm run build` (buduje aplikację i zapisuje skompresowane kopie `.br`/`.gz`), potem `NODE_ENV=production npm start` serwuje aplikację i API.

Konfiguracja w zmiennych środowiskowych albo w pliku `.env` (wzór: `.env.example`; pliku `.env` nie dodaje się do repozytorium):

- `PORT` (8787), `HOST` (`0.0.0.0` w produkcji, `127.0.0.1` poza nią).
- `TRUSTED_PROXY=1`, gdy przed serwerem stoi reverse proxy ustawiające `X-Forwarded-For` (limity zapytań liczą się wtedy per adres klienta, nie per proxy).
- `APP_ORIGIN`, publiczny adres aplikacji; zgłoszenia mogą zawierać tylko link do niej.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `REPORT_FROM`, `REPORT_TO`: serwer poczty i adresat zgłoszeń błędów. Bez `SMTP_HOST` i `REPORT_TO` formularz jest wyłączony.

## Architektura

- `src/` aplikacja: React 19, TypeScript, OpenLayers 10 z widokiem w EPSG:2180, Tailwind CSS.
- `src/services/registry.ts` rejestr usług GUGiK: jedno miejsce, z którego powstają warstwy, katalog i atrybucja.
- `server/` lekki backend (Hono): cache metadanych usług, słowniki do wyszukiwarki działek (województwa, powiaty, gminy, obręby) z cache na dysku, pośrednik GetFeatureInfo i wysyłka zgłoszeń błędów. Bez bazy danych.
- Wydruk działa w całości w przeglądarce (`src/map/print.ts`): mapa jest na chwilę renderowana w arkuszu w skali wydruku i drukowana mechanizmem przeglądarki. Edytor wydruku geoportal.gov.pl przyjmuje model mapy, ale renderuje go serwer wydruku dostępny tylko z tokenem GUGiK, więc nie da się go użyć z zewnętrznej aplikacji.
- Raport o działce to strona geoportal.gov.pl (`imap/parcelInfo`) otwierana dla współrzędnych klikniętego miejsca.
- `public/thumbs/` miniatury podkładów: po jednym kaflu z każdej usługi, zmniejszonym do 128 px.
- `scripts/precompress.ts` kompresja zbudowanych plików po `vite build`.

## Bezpieczeństwo API

API nie ma kont ani danych użytkowników. Zabezpieczenia:

- `/api/featureinfo/:service` przyjmuje tylko usługi z rejestru, a każdy parametr jest walidowany i budowany na nowo (warstwy ze znanej listy, BBOX liczbowy, rozmiary do 4096 px, do 50 obiektów). Przekierowania usług GUGiK są śledzone po stronie serwera tylko na publiczne hosty (adresy rozwiązywane i sprawdzane względem sieci prywatnych) na portach 80, 443, 8080 i 8443. Odpowiedź jest czytana do 1 MB z jednym limitem czasu na cały łańcuch i zwracana jako zwykły tekst.
- `/api/dict/szukaj?q=` szuka jednostek w liście całego kraju zapisanej w cache (trzy zapytania do PRG raz na 30 dni); nazwa ma do 60 liter, spacji, kropek i myślników, inne zapytania dostają pustą listę bez pytania usługi źródłowej.
- `/api/dict/...` przyjmuje kod tylko wtedy, gdy występuje na liście nadrzędnej (powiat musi istnieć w województwie itd.), więc cache na dysku nie rośnie od zmyślonych identyfikatorów. Puste odpowiedzi nie trafiają na dysk.
- Limity zapytań per adres (token bucket w pamięci) na słownikach i GetFeatureInfo, limit równoległych zapytań do usług źródłowych.
- `POST /api/capabilities/refresh` działa tylko z tej samej maszyny i wymaga nagłówka `X-Refresh: capabilities`.
- `POST /api/report` przyjmuje JSON do 16 KB: rodzaj ze stałej listy, opis 10–3000 znaków bez znaków sterujących, opcjonalny e-mail (sprawdzany, trafia tylko do `Reply-To`) i link wyłącznie do tej aplikacji. Temat wiadomości powstaje z rodzaju, a treść jest zwykłym tekstem. Ukryte pole odsiewa boty, a limit to 3 zgłoszenia na raz i 6 na godzinę z jednego adresu. Dane logowania SMTP są tylko w `.env` na serwerze.
- Wydruk nie ma punktu końcowego na serwerze: obraz składa przeglądarka użytkownika z tych samych kafli, które widzi na ekranie.
- Nagłówki: Content Security Policy (skrypty tylko własne, obrazy map z dowolnego hosta https, połączenia tylko do usług GUGiK), `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Błędy usług źródłowych są logowane na serwerze, a klient dostaje jedno ogólne zdanie.

## Dane

Wszystkie dane pochodzą z usług sieciowych Głównego Urzędu Geodezji i Kartografii oraz serwerów starostw i gmin, z którymi te usługi się łączą. Aplikacja pobiera je na bieżąco i nie przechowuje ich. Źródło: geoportal.gov.pl. Informacje mają charakter poglądowy i nie są dokumentem urzędowym.
