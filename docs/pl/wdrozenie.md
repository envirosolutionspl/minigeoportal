# Wdrożenie

Trzy sposoby uruchomienia serwisu, od najprostszego:

1. [Docker Compose z Caddy](#docker-compose-zalecane): certyfikat i HTTP/3 same się ustawiają.
2. [Docker za istniejącym nginx](#docker-za-istniejącym-proxy-nginx), gdy serwer obsługuje już inne strony.
3. [Sam Node, bez Dockera](#jeden-serwer-bez-dockera).

Wszystkie korzystają z tego samego katalogu konfiguracji (zob. [Pierwsze wdrożenie](pierwsze-wdrozenie.md)).

## Wymagania

- Node.js 22.18 lub nowszy (serwer to TypeScript uruchamiany bezpośrednio przez Node, bez transpilacji) albo Docker z Compose.
- Usługi mapowe dostępne po https: obrazy wczytuje przeglądarka, a strona dopuszcza tylko https.
- Do wdrożenia publicznego: domena wskazująca na serwer i otwarte porty 80 i 443 (TCP) oraz 443 (UDP, HTTP/3).

## Praca nad aplikacją

```bash
npm install
npm run dev # aplikacja i API, odświeżane przy zmianach kodu
CONFIG_DIR=examples/osm npm run dev # inne wdrożenie
```

`npm run dev` uruchamia aplikację (Vite, port 5173) i API (port 8787). API restartuje się samo po zmianach w `config/`; przy innym `CONFIG_DIR` trzeba je uruchomić ponownie. `npm run check` uruchamia kontrolę typów, ESLint, Prettier i testy.

## Docker Compose (zalecane)

GitHub Actions publikuje gotowy obraz `ghcr.io/envirosolutionspl/minigeoportal` dla serwerów x86 (64-bit), z tagami `latest`, `sha-<commit>` i numerami wersji. Serwer niczego nie buduje, tylko pobiera obraz. Obraz działa bez uprawnień roota i poprawnie kończy pracę na SIGTERM.

1. Na serwerze sklonuj repozytorium (potrzebne są `compose.yaml`, `deploy/` i katalog konfiguracji) i umieść w nim swój katalog konfiguracji.
2. W `compose.yaml`, w usługach `app` i `updater`, zamień montowany katalog `./config` na swój: `- ./moja-mapa:/app/config:ro`.
3. Utwórz `.env` obok `compose.yaml` (wzór: `.env.example`) z domeną. Jeśli formularz zgłoszeń i maile o błędach mają działać, dopisz ustawienia poczty (i ustaw `admin` w `app.yaml`). Domena musi być w `.env`, bo Compose czyta ją przy każdym poleceniu; bez niej aplikacja i Caddy dostają `localhost`.
4. Uruchom:

```bash
printf 'DOMAIN=mapa.example.org\n' >> .env
docker compose up -d
docker compose pull && docker compose up -d    # aktualizacja do nowego obrazu
docker compose up -d --scale app=3             # więcej replik aplikacji
docker compose logs -f app                     # logi
docker compose up -d --build                   # obraz zbudowany z lokalnej kopii zamiast pobranego
```

Co uruchamia `compose.yaml`:

| Usługa    | Rola                                                                                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `caddy`   | Wejście z internetu. Sam uzyskuje certyfikat dla `DOMAIN`, obsługuje HTTP/2 i HTTP/3. Kieruje każdego odwiedzającego zawsze do tej samej repliki. Treść zapytań do 64 KB.                       |
| `app`     | Aplikacja i API (port 8787, dostępny tylko w sieci Compose). Domyślnie 2 repliki z `SHARED_DATA=1` i `TRUSTED_PROXY=1`. Repliki nie budują danych same, tylko czytają to, co zapisze `updater`. |
| `updater` | Ten sam obraz. Odświeża dane (to samo co `npm run update`) przy starcie, a potem co 24 godziny.                                                                                                 |

Dobrze wiedzieć:

- Po zmianie konfiguracji wystarczy `docker compose up -d --force-recreate app updater`. Konfiguracja jest montowana tylko do odczytu.
- Wolumeny: `data` (dane serwera, `/data` w kontenerach), `caddy-data` i `caddy-config` (certyfikaty Caddy).
- Każda replika ma limit 65536 otwartych plików (`ulimits` w `compose.yaml`). Domyślne 1024 Dockera to sufit około tysiąca równoczesnych połączeń.
- Ustawienia poczty i inne sekrety trafiają do `.env`.
- Obraz powstaje tylko wtedy, gdy zmienia się coś, co do niego trafia (także treści `config/content/*.md`). Sama dokumentacja go nie przebudowuje, ale jest sprawdzana testami.

Sam obraz, bez Compose:

```bash
docker run -p 8787:8787 -v minigeoportal-data:/data ghcr.io/envirosolutionspl/minigeoportal
```

## Docker za istniejącym proxy (nginx)

Gdy na serwerze działa już nginx (albo Apache) z innymi stronami, Caddy nie jest potrzebny. Nakładka `compose.proxy.yaml` uruchamia dwie repliki aplikacji dostępne tylko lokalnie, pod `127.0.0.1:8787` i `127.0.0.1:8788`:

```bash
printf 'DOMAIN=mapa.example.org
COMPOSE_FILE=compose.yaml:compose.proxy.yaml
COMPOSE_PARALLEL_LIMIT=1
' >> .env
docker compose up -d
```

- `COMPOSE_PARALLEL_LIMIT=1` sprawia, że aktualizacja odtwarza repliki po kolei. W tym czasie nginx odpowiada z tej, która działa, więc aktualizacja nie daje błędów 502.
- Wzór konfiguracji nginx (przekierowanie `www`, blok `upstream` z dwiema replikami, `keepalive`) jest w `deploy/nginx/minigeoportal.conf`.
- W `/etc/nginx/nginx.conf` podnieś limity: `worker_rlimit_nofile 65536;` i `worker_connections 4096;`. Domyślne 1024 otwarte pliki na proces wystarczają na ok. 500 połączeń przez proxy.
- Certyfikat: `certbot --nginx -d mapa.example.org -d www.mapa.example.org --redirect`.

## Jeden serwer bez Dockera

```bash
npm ci
npm run build
NODE_ENV=production HOST=127.0.0.1 TRUSTED_PROXY=1 \
  CONFIG_DIR=/etc/minigeoportal DATA_DIR=/var/lib/minigeoportal npm start
```

Serwer udostępnia aplikację i API na porcie `PORT` (8787). Przed nim postaw reverse proxy z HTTPS, np. Caddy:

```
mapa.example.org {
	reverse_proxy 127.0.0.1:8787
}
```

`HOST=127.0.0.1` jest konieczne razem z `TRUSTED_PROXY=1`. Inaczej ktoś łączący się bezpośrednio mógłby podać fałszywy adres klienta i ominąć limity zapytań.

Serwer przechowuje dane między uruchomieniami (metadane usług, katalog geoportalu, słowniki) w `DATA_DIR`:

- Sam odświeża je raz na dobę, więc cron nie jest konieczny.
- `npm run update` odświeża je od razu, np. po zmianie konfiguracji albo o stałej porze. Serwer wczyta nowe dane w ciągu minuty, bez restartu:

  ```
  0 4 * * * cd /srv/minigeoportal && CONFIG_DIR=/etc/minigeoportal DATA_DIR=/var/lib/minigeoportal npm run update
  ```

- Nowy katalog danych zaczyna od `seed/capabilities.json` z katalogu konfiguracji, jeśli jest. Bez niego serwer startuje od razu, bez metadanych usług (zakresów skal, legend), i pobiera je w tle. Przeglądarki dostają je przy następnym wczytaniu strony. Serwer nigdy nie czeka na usługi przed startem.

Jako usługę systemową uruchamia się go dowolnym menedżerem (systemd, pm2). Na SIGTERM kończy trwające zapytania i się zamyka.

## Marka

Co sprawia, że wdrożenie wygląda jak własne, bez zmiany kodu:

- **Nazwa i teksty**: `name`, `title`, `description` i `tagline` w `app.yaml`, okno powitalne i deklaracja dostępności w Markdown (zob. [Treści i języki](tresci-i-jezyki.md)).
- **Kolory**: skórka (zob. [Skórki](skorki.md)).
- **Znak aplikacji**: `icon` w `app.yaml`. Zastępuje wbudowany znak na pasku i w oknie powitalnym, ikonę karty przeglądarki, ikonę na ekranie telefonu i obraz podglądu linku. Bez niego aplikacja używa własnego znaku w kolorach skórki i ikon z `public/` (`favicon.ico`, `favicon.svg`, `apple-touch-icon.png`).
- **Logo autora**: `author.logo` w `app.yaml`, na białym tle obok „Stworzone przez” w rogu mapy, w oknie powitalnym i w menu „Więcej”. Bez niego nazwa autora.

Serwer udostępnia oba obrazy pod `/brand/logo.<rozszerzenie>` i `/brand/icon.<rozszerzenie>`, z początkiem skrótu pliku w adresie. Przeglądarki trzymają je więc na stałe, a nowy plik od razu trafia do wszystkich.

Dwie rzeczy są w `public/` i trafiają do builda:

- miniatury podkładów (`public/thumbs/`, wskazywane przez `thumb` w `map.yaml`; działa też pełny adres https);
- `robots.txt`, który pozwala wyszukiwarkom indeksować wszystko.

Wdrożenie, które chce innych, podmienia te pliki przed `npm run build`. Gotowy obraz Dockera ma miniatury z repozytorium, więc własne podkłady podają wtedy `thumb` jako pełny adres https albo budują własny obraz.

## Działanie serwera

**Limity zapytań** na adres klienta (IPv6 liczone po /64), naraz i na minutę:

| Zapytania                                     | Naraz | Na minutę             |
| --------------------------------------------- | ----- | --------------------- |
| informacja o miejscu                          | 40    | 60                    |
| słowniki działek                              | 30    | 60                    |
| skorowidze ortofotomapy i map topograficznych | 10    | 30                    |
| wyszukiwarka Nominatim                        | 10    | 30                    |
| zgłoszenia błędów                             | 3     | potem jedno na 10 min |

Do usług źródłowych serwer otwiera najwyżej 24 połączenia naraz; ponad to odpowiada 503. Każda replika liczy limity osobno, a Caddy kieruje odwiedzającego zawsze do tej samej. Za proxy ustaw `TRUSTED_PROXY=1`, inaczej wszyscy dzielą limit adresu proxy.

**Nagłówki bezpieczeństwa:**

- Content Security Policy: skrypty, style i czcionki tylko z serwisu; obrazy z dowolnego adresu https (kafle i obrazy usług); połączenia tylko do serwisu, a z modułem gugik także do usług wyszukiwarki GUGiK, modelu terenu i geokodera adresów (`services.gugik.gov.pl`).
- `frame-ancestors 'none'`: strony nie da się osadzić w ramce na innej stronie.
- `Strict-Transport-Security` na pół roku, tylko dla hosta aplikacji (bez subdomen), więc proxy nie musi go dodawać.

**Konfiguracja i dane w kontenerze:** konfiguracja jest w `/app/config`, tylko do odczytu; może zawierać `skins/`, `i18n/`, `content/`, `seed/` i `brand/`. Dane są w `/data` i są tylko pamięcią podręczną: wolumen można wyczyścić, serwer odbuduje je sam.

**Punkty kontrolne:**

- `GET /api/health`: `{ ok, capabilitiesGeneratedAt }`;
- `GET /api/config`: konfiguracja przekazywana aplikacji;
- `GET /api/report`: `{ enabled }`, czy formularz zgłoszeń działa;
- `GET /api/capabilities`;
- `GET /api/catalog` (moduł gugik).

**Logi** są na standardowym wyjściu: błędy usług źródłowych, błędy krytyczne (niżej) i powód wyłączenia formularza zgłoszeń (brak serwera poczty, adresu `admin` w `app.yaml` albo nadawcy). Na SIGTERM serwer kończy trwające zapytania, najdłużej 10 sekund.

## Błędy krytyczne

Błąd krytyczny to coś, czego serwer nie naprawi sam:

- skonfigurowana usługa (podkład albo warstwa z konfiguracji) nie odpowiedziała przy odświeżaniu danych;
- odświeżanie nie powiodło się w całości (także pierwsze, przy starcie);
- błąd, którego nic w serwerze nie przechwyciło. Proces wtedy się zatrzymuje, a Docker lub menedżer usług uruchamia go ponownie.

Błąd krytyczny trafia do logu jako wiersz zaczynający się od `CRITICAL`. Przy ustawionym serwerze poczty idzie też e-mailem na adres `admin` z `app.yaml` (ten sam co zgłoszenia), w języku `report.locale`. Ten sam błąd idzie mailem najwyżej raz na dobę, a wszystkich najwyżej dziesięć na dobę.

Warstwy katalogu geoportalu, które nie odpowiadają, nie są krytyczne: jest ich kilkaset i część zawsze nie działa.

W Docker Compose usługa `updater` też czyta `.env`, więc jej odświeżanie wysyła maile przez ten sam serwer poczty.

Bezpieczeństwo i budowa serwera: [Architektura](architektura.md).

## Zmienne środowiskowe

Ustawia się je w środowisku albo w pliku `.env` w katalogu aplikacji (wzór z opisami: `.env.example`; `.env` nie trafia do repozytorium).

| Zmienna                                 | Domyślnie                                   | Znaczenie                                                                                                                                          |
| --------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_DIR`                            | `config`                                    | Katalog konfiguracji wdrożenia.                                                                                                                    |
| `DATA_DIR`                              | `server/data`                               | Katalog danych serwera. Musi być zapisywalny.                                                                                                      |
| `PORT`                                  | `8787`                                      | Port serwera.                                                                                                                                      |
| `HOST`                                  | `0.0.0.0` w produkcji, `127.0.0.1` poza nią | Adres nasłuchu. Za proxy na tej samej maszynie: `127.0.0.1`.                                                                                       |
| `NODE_ENV`                              |                                             | `production`: serwer udostępnia też zbudowaną aplikację z `dist/`. Obraz Dockera ustawia ją sam.                                                   |
| `APP_ORIGIN`                            | `https://` + `domain` z `app.yaml`          | Publiczny adres aplikacji, gdy jest inny niż domena z `app.yaml` (np. środowisko testowe). Zgłoszenia mogą linkować tylko do niego.                |
| `TRUSTED_PROXY`                         |                                             | `1` za reverse proxy, które dopisuje adres klienta do `X-Forwarded-For`. Limity zapytań liczą się wtedy dla każdego klienta.                       |
| `SHARED_DATA`                           |                                             | `1`, gdy kilka instancji dzieli `DATA_DIR`. Dane zapisuje wtedy tylko `npm run update`, a instancje je czytają. Bez tego serwer sam odświeża dane. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | `587`, STARTTLS                             | Serwer poczty dla maili do administratora (zgłoszenia i błędy krytyczne). Port 465 oznacza TLS od początku; `SMTP_SECURE` tylko to zmienia.        |
| `SMTP_USER`, `SMTP_PASS`                |                                             | Logowanie do serwera poczty. Tylko w `.env` lub w środowisku, nigdy w konfiguracji.                                                                |
| `REPORT_FROM`                           | `SMTP_USER`                                 | Nadawca maili. Bez `SMTP_HOST`, `admin` w `app.yaml` i nadawcy formularz zgłoszeń i maile o błędach są wyłączone.                                  |
| `API_PORT`                              | `8787`                                      | Tylko przy pracy nad aplikacją: gdzie serwer Vite znajduje API.                                                                                    |

## Ścieżki i pliki

| Ścieżka                               | Zawartość                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `<CONFIG_DIR>/`                       | Konfiguracja wdrożenia (zob. [Konfiguracja](konfiguracja.md)).                             |
| `<CONFIG_DIR>/seed/capabilities.json` | Metadane usług na start, gdy `DATA_DIR` jest pusty (opcjonalnie).                          |
| `<DATA_DIR>/capabilities.json`        | Metadane usług z ich GetCapabilities: zakresy skal, legendy, formaty informacji o miejscu. |
| `<DATA_DIR>/gugik/catalog.json`       | Katalog warstw geoportal.gov.pl (moduł `gugik`).                                           |
| `<DATA_DIR>/gugik/dict/`              | Słowniki wyszukiwarki działek: województwa, powiaty, gminy, obręby (moduł `gugik`).        |
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
