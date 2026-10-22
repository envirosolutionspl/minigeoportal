# MiniGeoportal

Lekka, szybka mapa internetowa dla publicznych usług mapowych, przeznaczona dla osób, które nie pracują z mapami zawodowo. Jedna aplikacja obsługuje dowolny zestaw usług: wdrożenie to katalog plików konfiguracyjnych (układ współrzędnych, podkłady, warstwy, wyszukiwarka, języki, skórka, treści), bez zmian w kodzie.

_A fast, simple web map for public map services. Every deployment is a directory of configuration files. Documentation in English: [docs/en](docs/en/README.md)._

Projekt open source na licencji MIT, tworzony przez [EnviroSolutions](https://envirosolutions.pl).

## Wdrożenia w repozytorium

| Katalog         | Wdrożenie                                                                                                                                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/`       | [MiniGeoportal](https://minigeoportal.pl): usługi Głównego Urzędu Geodezji i Kartografii (geoportal.gov.pl) w układzie PL-1992, z modułem `gugik`: działki, plany miejscowe i ogólne, ceny transakcyjne, uzbrojenie terenu, ortofotomapa i ponad 400 warstw geoportalu. |
| `examples/osm/` | Kafle OpenStreetMap w układzie Web Mercator, wyszukiwarka Nominatim i jedna warstwa WMS, bez żadnej usługi GUGiK. Dobry punkt wyjścia dla własnego wdrożenia.                                                                                                           |

## Funkcje

- Usługi WMS, WMTS, ArcGIS REST i kafle XYZ, w dowolnym układzie współrzędnych zdefiniowanym w konfiguracji. Obrazy są pobierane w układzie mapy, więc przeglądarka niczego nie przelicza.
- Podkłady składane z kilku usług zależnie od skali, warstwy tematyczne z wyborem pojedynczych podwarstw, przezroczystością i wyszukiwarką warstw.
- Informacje o klikniętym miejscu (GetFeatureInfo, ArcGIS identify) przez serwer pośredniczący.
- Wyszukiwarka do wyboru: usługi GUGiK, Nominatim (OpenStreetMap) albo żadna; współrzędne rozpoznawane zawsze.
- Pomiar odległości i powierzchni na elipsoidzie, współrzędne kursora w układzie mapy i w WGS 84.
- Wydruk w skali na A4 lub A3 z tytułem, legendą i źródłami, także do PDF przez okno drukowania przeglądarki.
- Link do bieżącego widoku, formularz zgłaszania błędów wysyłany e-mailem.
- Interfejs po polsku i angielsku z przełącznikiem języka; kolejne języki, treści w Markdown i skórki (kolory) dodaje się plikami w konfiguracji.
- Warstwy zmienne w czasie opisane w konfiguracji (wymiar TIME usługi albo seria edycji).
- Dostępność WCAG 2.1 AA: klawiatura, czytniki ekranu, tryb ciemny, ograniczenie ruchu, powiększenie tekstu i wysoki kontrast.

## Wymagania

- Node.js 22.18 lub nowszy (serwer to TypeScript uruchamiany bezpośrednio przez Node, bez transpilacji), albo Docker z Compose.
- Usługi mapowe dostępne po https (obrazy wczytuje przeglądarka, a strona i jej Content Security Policy dopuszczają tylko https).
- Do wdrożenia publicznego: domena wskazująca na serwer i otwarte porty 80 i 443 (TCP) oraz 443 (UDP, HTTP/3).

## Szybki start

```bash
git clone https://github.com/envirosolutionspl/minigeoportal.git
cd minigeoportal
npm install
npm run dev                            # wdrożenie z config/
CONFIG_DIR=examples/osm npm run dev    # inne wdrożenie
```

`npm run dev` uruchamia aplikację (Vite, port 5173) i API (port 8787); oba przeładowują się po zmianach, także po zmianie konfiguracji.

## Własne wdrożenie krok po kroku

### 1. Katalog konfiguracji

Skopiuj przykład i nadaj mu własną nazwę:

```bash
cp -r examples/osm moja-mapa
```

Struktura katalogu (pliki oznaczone `*` są wymagane):

```
moja-mapa/
  app.yaml *                    nazwa, domena, kontakt, języki, wyszukiwarka, moduły, formularz zgłoszeń
  map.yaml *                    układ współrzędnych, skale, widok startowy, usługi kafli, podkłady
  layers.yaml *                 tematy, warstwy nad podkładem, kolejność rysowania
  content/welcome.<język>.md    okno powitalne (gdy app.yaml wskazuje content.welcome)
  content/accessibility.<język>.md   deklaracja dostępności (gdy wskazuje content.accessibility)
  i18n/<język>.yaml             zmienione napisy interfejsu albo nowy język
  skins/<nazwa>/skin.css        własne kolory (gdy app.yaml wskazuje skin)
  seed/capabilities.json        metadane usług na start, przed pierwszym npm run update
```

### 2. app.yaml

```yaml
id: moja-mapa # małe litery, cyfry, myślniki; przedrostek danych w przeglądarce
name: Mapa gminy # albo { pl: Mapa gminy, en: Municipal map }
title: 'Mapa gminy: działki i plany'
description: Mapa z danymi gminy.
domain: mapa.example.org # drukowane na mapach
contact: kontakt@example.org
author: { name: Urząd Gminy, url: https://example.org }
locales: { default: pl, available: [pl, en] }
report:
  categories:
    - { id: mapa, label: Mapa lub warstwy }
    - { id: inne, label: Inne }
search:
  provider: nominatim # gugik | nominatim | none
  parcel: false # wyszukiwarka działek (moduł gugik)
```

### 3. map.yaml

```yaml
projection:
  code: EPSG:3857 # układ kafli OpenStreetMap; PL-1992 itp. z polem proj4 (zob. config/map.yaml)
  name: Web Mercator # nazwa na pasku współrzędnych i wydrukach
  axisOrientation: enu # neu, gdy EPSG podaje najpierw northing (np. PL-1992)
  extent: [-20037508.34, -20037508.34, 20037508.34, 20037508.34]
zoom:
  # Mianowniki skal poziomów przybliżenia, od największego (tu poziomy 5–19 siatki kafli).
  scales:
    [
      17471320.7509,
      8735660.3754,
      4367830.1877,
      2183915.0939,
      1091957.5469,
      545978.7735,
      272989.3867,
      136494.6934,
      68247.3467,
      34123.6733,
      17061.8367,
      8530.9183,
      4265.4592,
      2132.7296,
      1066.3648,
    ]
view:
  center: [2338455, 6842147]
  zoom: 5 # numer poziomu z zoom.scales
  home: [2310000, 6820000, 2370000, 6870000]
  homeLabel: Cała gmina
  base: osm
attribution: '© [OpenStreetMap](https://www.openstreetmap.org/copyright)'
tileServices:
  - { id: osm, kind: xyz, url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19 }
baseMaps:
  - { id: osm, title: Mapa, description: OpenStreetMap, sources: [{ service: osm }] }
```

Usługi WMS, WMTS i ArcGIS muszą udostępniać mapę w układzie z `projection.code`; aplikacja niczego nie przelicza w przeglądarce. Wdrożenie w PL-1992 z usługami WMTS: `config/map.yaml`.

### 4. layers.yaml

```yaml
topics:
  - { id: planowanie, title: Planowanie }
overlays:
  - id: mpzp
    kind: wms # wms | wmts | rest
    url: https://wms.example.org/mpzp
    title: Plany miejscowe
    description: Miejscowe plany zagospodarowania przestrzennego.
    topic: planowanie
    starter: true # w grupie „Najpopularniejsze”
    sublayers:
      - { name: przeznaczenie, title: Przeznaczenie terenu, default: true }
```

### 5. Sprawdzenie i uruchomienie

```bash
npm run config:check moja-mapa        # błędy z plikiem, wierszem i kolumną
CONFIG_DIR=moja-mapa npm run dev
```

Opis każdego pola: [docs/pl/konfiguracja.md](docs/pl/konfiguracja.md); treści i języki: [docs/pl/tresci-i-jezyki.md](docs/pl/tresci-i-jezyki.md); skórki: [docs/pl/skorki.md](docs/pl/skorki.md); wyszukiwarka i moduł GUGiK: [docs/pl/wyszukiwarka-i-moduly.md](docs/pl/wyszukiwarka-i-moduly.md); warstwy zmienne w czasie: [docs/pl/warstwy-czasowe.md](docs/pl/warstwy-czasowe.md).

## Wdrożenie produkcyjne

### Docker Compose (zalecane)

Gotowy obraz publikuje GitHub Actions: `ghcr.io/envirosolutionspl/minigeoportal` (tagi `latest`, `sha-<commit>` i numery wersji) dla serwerów x86 (64-bit). Obraz powstaje tylko wtedy, gdy zmienia się coś, co do niego trafia; zmiany w dokumentacji go nie przebudowują. Serwer niczego nie buduje, tylko pobiera obraz.

1. Na serwerze sklonuj repozytorium (potrzebne są `compose.yaml`, `deploy/` i katalog konfiguracji) i umieść w nim swój katalog konfiguracji.
2. W `compose.yaml` zamień montowany katalog `./config` na swój (w usługach `app` i `updater`): `- ./moja-mapa:/app/config:ro`.
3. Utwórz `.env` obok `compose.yaml` (wzór: `.env.example`), co najmniej z ustawieniami poczty, jeśli formularz zgłoszeń ma działać.
4. Uruchom:

```bash
DOMAIN=mapa.example.org docker compose up -d
docker compose pull && docker compose up -d    # aktualizacja do nowego obrazu
docker compose up -d --scale app=3             # więcej replik aplikacji
docker compose logs -f app                     # logi
docker compose up -d --build                   # obraz zbudowany z lokalnej kopii zamiast pobranego
```

Co uruchamia `compose.yaml`:

| Usługa    | Rola                                                                                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `caddy`   | Wejście z internetu: certyfikat dla `DOMAIN`, HTTP/2 i HTTP/3, porty 80, 443 i 443/UDP. Rozdziela ruch między repliki, jeden odwiedzający zawsze trafia do tej samej. |
| `app`     | Aplikacja i API (port 8787 w sieci Compose, niedostępny z zewnątrz), domyślnie 2 repliki z `SHARED_DATA=1` i `TRUSTED_PROXY=1`.                                       |
| `updater` | Ten sam obraz; uruchamia `npm run update` przy starcie i potem co 24 godziny. Repliki wczytują nowe dane w ciągu minuty.                                              |

Wolumeny: `data` (dane serwera, `/data` w kontenerach), `caddy-data` i `caddy-config` (certyfikaty Caddy). Konfiguracja jest montowana tylko do odczytu; po jej zmianie wystarczy `docker compose restart app updater`.

### Jeden serwer bez Dockera

```bash
npm ci
npm run build
NODE_ENV=production HOST=127.0.0.1 TRUSTED_PROXY=1 \
  CONFIG_DIR=/etc/minigeoportal DATA_DIR=/var/lib/minigeoportal \
  APP_ORIGIN=https://mapa.example.org npm start
```

Przed serwerem postaw reverse proxy z HTTPS, np. Caddy:

```
mapa.example.org {
	reverse_proxy 127.0.0.1:8787
}
```

i odświeżaj dane raz dziennie, np. przez cron:

```
0 4 * * * cd /srv/minigeoportal && CONFIG_DIR=/etc/minigeoportal DATA_DIR=/var/lib/minigeoportal npm run update
```

Serwer jako usługę systemową uruchamia się dowolnym menedżerem (systemd, pm2); na SIGTERM kończy trwające zapytania i zamyka się.

## Parametry (zmienne środowiskowe)

Ustawia się je w środowisku albo w pliku `.env` w katalogu aplikacji (wzór: `.env.example`; plik `.env` nie trafia do repozytorium).

| Zmienna                                 | Domyślnie                                   | Znaczenie                                                                                                                        |
| --------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_DIR`                            | `config`                                    | Katalog konfiguracji wdrożenia.                                                                                                  |
| `DATA_DIR`                              | `server/data`                               | Katalog danych serwera (zob. niżej). Musi być zapisywalny.                                                                       |
| `PORT`                                  | `8787`                                      | Port serwera.                                                                                                                    |
| `HOST`                                  | `0.0.0.0` w produkcji, `127.0.0.1` poza nią | Adres nasłuchu. Za proxy na tej samej maszynie: `127.0.0.1`.                                                                     |
| `NODE_ENV`                              |                                             | `production`: serwer udostępnia też zbudowaną aplikację z `dist/`.                                                               |
| `APP_ORIGIN`                            |                                             | Publiczny adres aplikacji, np. `https://mapa.example.org`. Zgłoszenia mogą zawierać link tylko do niego; wymagany w produkcji.   |
| `TRUSTED_PROXY`                         |                                             | `1` za reverse proxy dopisującym adres klienta do `X-Forwarded-For`; limity zapytań liczą się wtedy dla każdego klienta.         |
| `SHARED_DATA`                           |                                             | `1`, gdy kilka instancji dzieli `DATA_DIR`: dane zapisuje tylko `npm run update`, instancje wczytują je ponownie w ciągu minuty. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | `587`, STARTTLS                             | Serwer poczty dla formularza zgłoszeń (`SMTP_SECURE=true` dla portu 465).                                                        |
| `SMTP_USER`, `SMTP_PASS`                |                                             | Logowanie do serwera poczty. Tylko w `.env` lub w środowisku, nigdy w konfiguracji.                                              |
| `REPORT_FROM`, `REPORT_TO`              |                                             | Nadawca i adresat zgłoszeń. Bez `SMTP_HOST` i `REPORT_TO` formularz jest wyłączony.                                              |
| `API_PORT`                              | `8787`                                      | Tylko przy pracy nad aplikacją: gdzie serwer Vite znajduje API.                                                                  |

## Ścieżki i pliki

| Ścieżka                               | Zawartość                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `<CONFIG_DIR>/`                       | Konfiguracja wdrożenia (zob. wyżej).                                                       |
| `<CONFIG_DIR>/seed/capabilities.json` | Metadane usług na start, gdy `DATA_DIR` jest pusty (opcjonalnie).                          |
| `<DATA_DIR>/capabilities.json`        | Metadane usług z ich GetCapabilities: zakresy skal, legendy, formaty informacji o miejscu. |
| `<DATA_DIR>/catalog/catalog.json`     | Katalog warstw geoportal.gov.pl (moduł `gugik`).                                           |
| `<DATA_DIR>/dict/`                    | Słowniki wyszukiwarki działek: województwa, powiaty, gminy, obręby (moduł `gugik`).        |
| `dist/`                               | Zbudowana aplikacja (`npm run build`), ze skompresowanymi kopiami `.br` i `.gz`.           |
| `skins/`, `i18n/`                     | Skórki i napisy interfejsu dołączone do aplikacji.                                         |

## Polecenia

| Polecenie                        | Działanie                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                    | Praca nad aplikacją: aplikacja i API z przeładowaniem po zmianach.                                               |
| `npm run build`                  | Budowa aplikacji do `dist/`.                                                                                     |
| `npm start`                      | Serwer (z `NODE_ENV=production` także aplikacja).                                                                |
| `npm run update`                 | Odświeżenie danych serwera: metadanych usług i, z modułem `gugik`, katalogu warstw geoportalu (minuta lub dwie). |
| `npm run config:check [katalog]` | Sprawdzenie konfiguracji bez uruchamiania serwera.                                                               |
| `npm run check`                  | Kontrola typów, ESLint, Prettier i testy.                                                                        |
| `npm test`                       | Same testy (Vitest).                                                                                             |

Punkty kontrolne serwera: `GET /api/health` (stan i data metadanych), `GET /api/config` (konfiguracja przekazywana aplikacji).

## Architektura

- `src/`: aplikacja w React 19, TypeScript i OpenLayers 10, style w Tailwind CSS. Konfigurację dostaje w samej stronie (`src/config/runtime.ts`), bez dodatkowego zapytania.
- `server/`: lekki serwer (Hono) bez bazy danych: konfiguracja (`server/config/`), cache metadanych usług, pośrednik zapytań o punkt, wyszukiwarka Nominatim, wysyłka zgłoszeń.
- `server/modules/gugik/` i `src/modules/gugik/`: opcjonalna integracja z geoportal.gov.pl: katalog wszystkich warstw geoportalu budowany z jego konfiguracji i sprawdzany usługa po usłudze, kolejność rysowania, słowniki wyszukiwarki działek, skorowidz ortofotomapy, wyszukiwarka GUGiK, link do raportu o działce.
- `i18n/`: napisy interfejsu (pl, en); `skins/`: skórki dołączone do aplikacji.
- `Dockerfile`, `compose.yaml`, `deploy/caddy/`: kontenery.

## Jakość

`npm run check` uruchamia kontrolę typów, ESLint (reguły TypeScript, React hooks, dostępności), Prettier i testy (Vitest): serwerowe w Node, aplikacji w jsdom, w tym reguły WCAG biblioteki axe-core, kontrast każdej skórki, kompletność tłumaczeń i opis każdego pola konfiguracji w dokumentacji. Każda zmiana ma mieć test w tym samym commicie.

## Bezpieczeństwo

API nie ma kont ani danych użytkowników.

- Serwer łączy się z adresami usług tylko po sprawdzeniu, że to http(s) na typowym porcie, a host wskazuje adresy publiczne (także przy każdym przekierowaniu), więc nie da się nim sięgnąć do sieci wewnętrznej.
- Zapytania o punkt przyjmują tylko usługi z konfiguracji lub z katalogu, a każdy parametr jest sprawdzany i budowany na nowo; odpowiedzi są czytane z limitem rozmiaru i czasu.
- Limity zapytań na adres klienta i limit równoległych połączeń do usług źródłowych; wyszukiwarka Nominatim wysyła najwyżej jedno zapytanie na sekundę.
- Konfiguracja nie może zawierać sekretów (klucze wyglądające na hasła i tokeny są odrzucane), a treści Markdown nie mogą wstawić HTML ani skryptów.
- Nagłówki: Content Security Policy budowana z konfiguracji, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.

## Dane

Aplikacja pobiera dane na bieżąco z usług wskazanych w konfiguracji i ich nie przechowuje. Za dane odpowiadają ich wydawcy; informacje mają charakter poglądowy.
