# Prosty Geoportal

Roboczo: prostygeoportal.pl. Niezależna, lekka aplikacja mapowa dla osób, które chcą szybko sprawdzić działkę: granice, numer, przeznaczenie w planie, ceny w okolicy, uzbrojenie, ortofotomapę aktualną i archiwalną. Interfejs w stylu map konsumenckich, dane na żywo z usług GUGiK (geoportal.gov.pl).

Projekt open source na licencji MIT, tworzony przez [EnviroSolutions](https://envirosolutions.pl).

## Funkcje

- Wyszukiwarka adresów, ulic, miejscowości, gmin, powiatów, województw i obiektów fizjograficznych (rzeki, jeziora, szczyty) oraz osobna wyszukiwarka działek z listami województw, powiatów, gmin i obrębów. Źródła: geokoder UUG, indeks pełnotekstowy geoportalu (miejscowości i obiekty z PRNG, miasta przed wsiami), listy PRG z cache serwera. Jednostki są pokazywane z obrysem z PRG (uogólnionym, kilkadziesiąt KB), a obiekty fizjograficzne jako punkty, bo PRNG nie ma ich obrysów: rzeka to szereg punktów wzdłuż biegu.
- Podkłady: ortofotomapa, mapa BDOO + BDOT10k (domyślna na komputerze), mapa uproszczona (domyślna na telefonie), mapa terenu, skany, brak podkładu.
- Warstwy „Najpopularniejsze”: ewidencja gruntów i budynków, plany miejscowe i ogólne, studium, ceny transakcyjne, uzbrojenie terenu, BDOT500, adresy i ulice, granice PRG, z wyborem pojedynczych warstw i przezroczystości.
- Wszystkie warstwy geoportal.gov.pl (ok. 430) w 13 tematach, z wyszukiwarką. Warstwy, których nie da się u nas pokazać (token, blokada, typ usługi), są w swoim temacie wyszarzone, z wyjaśnieniem przyczyny.
- Informacje o klikniętym miejscu (GetFeatureInfo), link do raportu o działce z geoportal.gov.pl (dane ewidencyjne, mapy, eksport do PDF) oraz data i wielkość piksela zdjęcia lotniczego w tym miejscu ze skorowidzów ortofotomap, z linkiem do pobrania arkusza GeoTIFF.
- Pomiar odległości i powierzchni (geodezyjnie, na elipsoidzie) i współrzędne kursora w PL-1992 oraz WGS 84.
- Wydruk w skali 1:500–1:2 500 000 na A4 lub A3 z tytułem, legendą i źródłami, także jako PDF przez okno drukowania przeglądarki. Obszar wydruku jest zaznaczony ramką na mapie, a legenda obejmuje tylko warstwy, które serwer narysuje w tej skali.
- Kopiowanie linku do bieżącego widoku (środek, skala, podkład, włączone warstwy).
- Formularz zgłaszania błędów wysyłany e-mailem do administratora.
- Dostępność WCAG 2.1 AA: obsługa klawiaturą, czytniki ekranu, tryb ciemny, ograniczenie ruchu, przełączniki wielkości tekstu i wysokiego kontrastu, deklaracja dostępności.

## Uruchomienie

Wymagany Node.js 22.18 lub nowszy (serwer to TypeScript uruchamiany bezpośrednio przez Node, bez transpilacji).

```bash
npm install
npm run dev
```

Aplikacja: http://localhost:5173, API: http://localhost:8787. Front i API można też uruchomić osobno: `npm run dev:web` i `npm run dev:api`.

Odświeżenie cache metadanych usług (GetCapabilities) razem z kolejnością rysowania warstw odczytaną z konfiguracji geoportal.gov.pl (moduł „Geoportal Krajowy”; plik jest tylko czytany wzorcem, nigdy wykonywany, a gdy brakuje w nim którejś warstwy, zostaje wbudowana kolejność):

```bash
npm run capabilities
```

Katalog wszystkich warstw geoportal.gov.pl (`server/data/catalog/catalog.json`, poza repozytorium) buduje się sam w tle przy pierwszym starcie serwera i odświeża poleceniem (ok. 1–2 min, każda usługa jest sprawdzana):

```bash
npm run catalog
```

Testy (Vitest): `npm test`, w trybie ciągłym `npm run test:watch`. Testy leżą obok kodu: `server/*.test.ts` działają w Node i sprawdzają walidację, filtr przekierowań, limity, słowniki, parser capabilities, formularz zgłoszeń i trasy API; `src/**/*.test.ts(x)` działają w jsdom i sprawdzają parser odpowiedzi, wyszukiwarkę, stan mapy, adres URL, rejestr usług, pomiar, wydruk i komponenty. `src/ui/a11y.test.tsx` sprawdza komponenty regułami WCAG 2.1 A/AA biblioteki axe-core. Kontrastu nie da się sprawdzić w jsdom: kolory z palety mają co najmniej 4,5:1 w obu motywach (tekst pomocniczy 5,4:1, akcent 6,2:1, tryb ciemny 6:1). Każda nowa funkcja lub poprawka ma mieć test w tym samym commicie.

Produkcja: `npm run build` (buduje aplikację i zapisuje skompresowane kopie `.br`/`.gz`), potem `NODE_ENV=production npm start` serwuje aplikację i API.

Konfiguracja w zmiennych środowiskowych albo w pliku `.env` (wzór: `.env.example`; pliku `.env` nie dodaje się do repozytorium):

- `PORT` (8787), `HOST` (`0.0.0.0` w produkcji, `127.0.0.1` poza nią; za reverse proxy zostaw `127.0.0.1`).
- `TRUSTED_PROXY=1`, gdy przed serwerem stoi reverse proxy dopisujące adres klienta na końcu `X-Forwarded-For` (limity zapytań liczą się wtedy per adres klienta; wpisy wcześniejsze, które mógł dopisać sam klient, są ignorowane). Trasy odświeżania cache są wtedy wyłączone, zostają polecenia `npm run capabilities` i `npm run catalog`.
- `APP_ORIGIN`, publiczny adres aplikacji; zgłoszenia mogą zawierać tylko link do niej.
- `DATA_DIR`, katalog na cache serwera (domyślnie `server/data`).
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `REPORT_FROM`, `REPORT_TO`: serwer poczty i adresat zgłoszeń błędów. Bez `SMTP_HOST` i `REPORT_TO` formularz jest wyłączony.

## Architektura

- `src/` aplikacja: React 19, TypeScript, OpenLayers 10 z widokiem w EPSG:2180, Tailwind CSS.
- `src/services/registry.ts` rejestr usług GUGiK: jedno miejsce, z którego powstają warstwy, katalog i atrybucja.
- `server/` lekki backend (Hono): cache metadanych usług, katalog warstw geoportal.gov.pl, słowniki do wyszukiwarki działek (województwa, powiaty, gminy, obręby) z cache na dysku, pośrednik GetFeatureInfo i wysyłka zgłoszeń błędów. Bez bazy danych.
- Katalog warstw (`server/geoportalConfig.ts`, `server/catalog.ts`): serwer czyta konfigurację aplikacji geoportal.gov.pl (plik główny i 10 modułów tematycznych), rozwija grupy, przypisuje warstwy do tematów, usuwa duplikaty i sprawdza każdą usługę (WMS i WMTS przez GetCapabilities, ArcGIS REST przez opis usługi), zapisując jej metadane. Rysujemy tylko to, co serwer podaje w układzie PL-1992 (EPSG:2180), więc mapa nigdy nie przelicza obrazów w przeglądarce: WMS i dynamiczne mapy ArcGIS jako jeden obraz na widok, WMTS i kafle ArcGIS na siatce opisanej przez serwer. Warstwy dodane lub usunięte w geoportalu, zmienione adresy i metadane trafiają do nas przy odświeżeniu, bez zmian w kodzie. Gdy konfiguracji nie da się odczytać, zostaje poprzedni katalog; usługa, która chwilowo nie odpowiada, zachowuje ostatnie metadane. Aplikacja pobiera listę (ok. 14 KB po kompresji) przy otwarciu panelu warstw, a definicję warstwy dopiero przy jej włączeniu lub rozwinięciu listy podwarstw (pojedyncze podwarstwy można wybrać przed włączeniem całej usługi). Warstwy mapy powstają przy pierwszym włączeniu. Nasz rejestr (`src/services/registry.ts`) zostaje jako „kuracja”: polskie opisy i podwarstwy dla warstw z grupy „Najpopularniejsze”, połączone z katalogiem identyfikatorem warstwy geoportalu.
- Wydruk działa w całości w przeglądarce (`src/map/print.ts`): mapa jest na chwilę renderowana w arkuszu w skali wydruku i drukowana mechanizmem przeglądarki. Edytor wydruku geoportal.gov.pl przyjmuje model mapy, ale renderuje go serwer wydruku dostępny tylko z tokenem GUGiK, więc nie da się go użyć z zewnętrznej aplikacji.
- Raport o działce to strona geoportal.gov.pl (`imap/parcelInfo`) otwierana dla współrzędnych klikniętego miejsca.
- `public/thumbs/` miniatury podkładów: po jednym kaflu z każdej usługi, zmniejszonym do 128 px.
- `scripts/precompress.ts` kompresja zbudowanych plików po `vite build`.

## Bezpieczeństwo API

API nie ma kont ani danych użytkowników. Zabezpieczenia:

- Adresy usług z katalogu pochodzą z zewnętrznej konfiguracji, więc serwer przed każdym połączeniem (GetCapabilities, GetFeatureInfo, każde przekierowanie) sprawdza, że to http(s) na porcie 80, 443, 8080 lub 8443, a nazwa hosta wskazuje wyłącznie adresy publiczne. Nie da się nim sięgnąć do sieci wewnętrznej.
- `/api/catalog` i `/api/catalog/:id` zwracają dane z cache; `POST /api/catalog/refresh` działa tylko z tej samej maszyny z nagłówkiem `X-Refresh: catalog`. Opis usług i katalog mają nagłówek ETag, więc przeglądarka przy każdym otwarciu sprawdza aktualność, a niezmienione dane kosztują odpowiedź 304 bez treści.
- `/api/featureinfo/:service` przyjmuje tylko usługi z rejestru lub z katalogu (te, które przy ostatnim sprawdzeniu działały), a każdy parametr jest walidowany i budowany na nowo (warstwy ze znanej listy, BBOX liczbowy, rozmiary do 4096 px, do 50 obiektów). Przekierowania usług GUGiK są śledzone po stronie serwera tylko na publiczne hosty (adresy rozwiązywane i sprawdzane względem sieci prywatnych) na portach 80, 443, 8080 i 8443. Odpowiedź jest czytana do 1 MB z jednym limitem czasu na cały łańcuch i zwracana jako zwykły tekst.
- `/api/dict/szukaj?q=` szuka jednostek w liście całego kraju zapisanej w cache (trzy zapytania do PRG raz na 30 dni); nazwa ma do 60 liter, spacji, kropek i myślników, inne zapytania dostają pustą listę bez pytania usługi źródłowej.
- Limity zapytań na adres klienta: słowniki 30 na raz i 60 na minutę, informacje o miejscu 40 i 60, skorowidz ortofotomapy 10 i 30, zgłoszenia 3 i 6 na godzinę; jednocześnie trwają najwyżej 24 zapytania do usług źródłowych. Odpowiedzi API są kompresowane.
- `/api/dict/...` przyjmuje kod tylko wtedy, gdy występuje na liście nadrzędnej (powiat musi istnieć w województwie itd.), więc cache na dysku nie rośnie od zmyślonych identyfikatorów. Puste odpowiedzi nie trafiają na dysk.
- Limity zapytań per adres (token bucket w pamięci) na słownikach i GetFeatureInfo, limit równoległych zapytań do usług źródłowych.
- `POST /api/capabilities/refresh` działa tylko z tej samej maszyny i wymaga nagłówka `X-Refresh: capabilities`.
- `POST /api/report` przyjmuje JSON do 16 KB: rodzaj ze stałej listy, opis 10–3000 znaków bez znaków sterujących, opcjonalny e-mail (sprawdzany, trafia tylko do `Reply-To`) i link wyłącznie do tej aplikacji. Temat wiadomości powstaje z rodzaju, a treść jest zwykłym tekstem. Ukryte pole odsiewa boty, a limit to 3 zgłoszenia na raz i 6 na godzinę z jednego adresu. Dane logowania SMTP są tylko w `.env` na serwerze.
- `/api/orto?x=&y=` przyjmuje tylko punkt w granicach Polski (EPSG:2180) i pyta skorowidze ortofotomap GUGiK o ten punkt. Usługa odpowiada stroną HTML z rekordami w JavaScript; serwer wyciąga z niej pola wzorcem (nigdy jej nie wykonuje) i przepuszcza tylko daty, piksel, kolor, godło i linki do opendata.geoportal.gov.pl.
- Wydruk nie ma punktu końcowego na serwerze: obraz składa przeglądarka użytkownika z tych samych kafli, które widzi na ekranie.
- Nagłówki: Content Security Policy (skrypty tylko własne, obrazy map z dowolnego hosta https, połączenia tylko do usług GUGiK), `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Błędy usług źródłowych są logowane na serwerze, a klient dostaje jedno ogólne zdanie.

## Dane

Wszystkie dane pochodzą z usług sieciowych Głównego Urzędu Geodezji i Kartografii oraz serwerów starostw i gmin, z którymi te usługi się łączą. Aplikacja pobiera je na bieżąco i nie przechowuje ich. Źródło: geoportal.gov.pl. Informacje mają charakter poglądowy i nie są dokumentem urzędowym.
