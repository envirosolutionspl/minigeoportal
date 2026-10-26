# Wdrożenie

Trzy sposoby uruchomienia serwisu, od najprostszego: Docker Compose z Caddy (certyfikat i HTTP/3 same), Docker za nginx, który już działa na serwerze, albo sam Node bez Dockera. Wszystkie korzystają z tego samego katalogu konfiguracji (zob. [Pierwsze wdrożenie](pierwsze-wdrozenie.md)).

## Wymagania

- Node.js 22.18 lub nowszy (serwer to TypeScript uruchamiany bezpośrednio przez Node, bez transpilacji), albo Docker z Compose.
- Usługi mapowe dostępne po https: obrazy wczytuje przeglądarka, a strona i jej Content Security Policy dopuszczają tylko https.
- Do wdrożenia publicznego: domena wskazująca na serwer i otwarte porty 80 i 443 (TCP) oraz 443 (UDP, HTTP/3).

## Praca nad aplikacją

```bash
npm install
npm run dev # aplikacja i API, odświeżane przy zmianach kodu
CONFIG_DIR=examples/osm npm run dev # inne wdrożenie
```

`npm run dev` uruchamia aplikację (Vite, port 5173) i API (port 8787). Strona czyta konfigurację przy każdym wczytaniu, a API restartuje się samo po zmianach w `config/`; przy innym `CONFIG_DIR` API trzeba uruchomić ponownie. `npm run check` uruchamia kontrolę typów, ESLint, Prettier i testy.

## Docker Compose (zalecane)

Gotowy obraz publikuje GitHub Actions jako `ghcr.io/envirosolutionspl/minigeoportal` (tagi `latest`, `sha-<commit>` i numery wersji) dla serwerów x86 (64-bit). Powstaje tylko wtedy, gdy zmienia się coś, co do niego trafia (także treści `config/content/*.md`); sama dokumentacja go nie przebudowuje, ale jest sprawdzana testami. Obraz działa bez uprawnień roota, nie potrzebuje w działaniu narzędzi do budowania i poprawnie kończy pracę na SIGTERM. Serwer niczego nie buduje, tylko pobiera obraz.

1. Na serwerze sklonuj repozytorium (potrzebne są `compose.yaml`, `deploy/` i katalog konfiguracji) i umieść w nim swój katalog konfiguracji.
2. W `compose.yaml` zamień montowany katalog `./config` na swój, w usługach `app` i `updater`: `- ./moja-mapa:/app/config:ro`.
3. Utwórz `.env` obok `compose.yaml` (wzór: `.env.example`) z domeną i, jeśli formularz zgłoszeń ma działać, z ustawieniami poczty. Domena musi być w `.env`, bo Compose czyta ją przy każdym poleceniu; bez niej aplikacja i Caddy dostają `localhost`.
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

| Usługa    | Rola                                                                                                                                                                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `caddy`   | Wejście z internetu: sam uzyskuje certyfikat dla `DOMAIN`, HTTP/2 i HTTP/3 na portach 80, 443 i 443/UDP. Rozdziela odwiedzających między repliki i trzyma każdego przy jednej, więc liczone tam limity zapytań dotyczą odwiedzającego jako całości. Treść zapytań do 64 KB. |
| `app`     | Aplikacja i API (port 8787 w sieci Compose, niedostępny z zewnątrz), domyślnie 2 repliki z `SHARED_DATA=1` i `TRUSTED_PROXY=1`. Repliki nigdy same nie budują danych: czytają to, co zapisze `updater`, w ciągu minuty od zmiany. Każda odpowiada na `GET /api/health`.     |
| `updater` | Ten sam obraz; odświeża dane (`node server/update.ts`, to samo co `npm run update`) przy starcie, a potem co 24 godziny.                                                                                                                                                    |

Wolumeny: `data` (dane serwera, `/data` w kontenerach), `caddy-data` i `caddy-config` (certyfikaty Caddy). Konfiguracja jest montowana tylko do odczytu; po jej zmianie wystarczy `docker compose up -d --force-recreate app updater`. Ustawienia poczty i inne sekrety trafiają do `.env`.

Sam obraz, bez Compose:

```bash
docker run -p 8787:8787 -v minigeoportal-data:/data ghcr.io/envirosolutionspl/minigeoportal
```

## Docker za istniejącym proxy (nginx)

Gdy na serwerze działa już nginx (albo Apache) obsługujący kilka serwisów, Caddy nie jest potrzebny. Nakładka `compose.proxy.yaml` uruchamia jedną replikę aplikacji dostępną tylko lokalnie, pod `127.0.0.1:8787`:

```bash
printf 'DOMAIN=mapa.example.org\nCOMPOSE_FILE=compose.yaml:compose.proxy.yaml\n' >> .env
docker compose up -d
```

Wzór konfiguracji nginx (z przekierowaniem `www`) jest w `deploy/nginx/minigeoportal.conf`; certyfikat daje `certbot --nginx -d mapa.example.org -d www.mapa.example.org --redirect`.

## Jeden serwer bez Dockera

```bash
npm ci
npm run build
NODE_ENV=production HOST=127.0.0.1 TRUSTED_PROXY=1 \
  CONFIG_DIR=/etc/minigeoportal DATA_DIR=/var/lib/minigeoportal \
  APP_ORIGIN=https://mapa.example.org npm start
```

Serwer udostępnia aplikację i API na porcie `PORT` (8787). `HOST=127.0.0.1` jest konieczne razem z `TRUSTED_PROXY=1`: inaczej ktoś łączący się bezpośrednio podałby fałszywy adres klienta i ominął limity zapytań. Przed serwerem postaw reverse proxy z HTTPS, np. Caddy:

```
mapa.example.org {
	reverse_proxy 127.0.0.1:8787
}
```

Dane, które serwer przechowuje między uruchomieniami (metadane usług, katalog geoportalu, słowniki), są w `DATA_DIR`. Odświeżaj je raz dziennie, np. przez cron:

```
0 4 * * * cd /srv/minigeoportal && CONFIG_DIR=/etc/minigeoportal DATA_DIR=/var/lib/minigeoportal npm run update
```

Nowy katalog danych zaczyna od `seed/capabilities.json` z katalogu konfiguracji, jeśli jest. Bez niego pojedynczy serwer zaczyna od razu bez metadanych usług (zakresów skal, legend) i pobiera je w tle, tak jak katalog geoportalu; przeglądarki dostają je przy następnym wczytaniu strony. Serwer nigdy nie czeka na usługi przed startem. Jako usługę systemową uruchamia się go dowolnym menedżerem (systemd, pm2); na SIGTERM kończy trwające zapytania i zamyka się.

## Marka

Co sprawia, że wdrożenie wygląda jak własne, bez zmiany kodu:

- **Nazwa i teksty**: `name`, `title`, `description` i `tagline` w `app.yaml`, okno powitalne i deklaracja dostępności w Markdownie (zob. [Treści i języki](tresci-i-jezyki.md)).
- **Kolory**: skórka (zob. [Skórki](skorki.md)).
- **Znak aplikacji**: `icon` w `app.yaml`, obraz w katalogu konfiguracji. Zastępuje wbudowany znak na pasku i w oknie powitalnym, ikonę karty przeglądarki, ikonę na ekranie głównym telefonu i obraz podglądu linku. Bez niego aplikacja używa własnego znaku, rysowanego w kolorach skórki, i ikon z `public/` (`favicon.ico`, `favicon.svg`, `apple-touch-icon.png`).
- **Logo autora**: `author.logo` w `app.yaml`, pokazywane na białym tle obok „Stworzone przez” w rogu mapy, w oknie powitalnym i w menu „Więcej”; bez niego nazwa autora.

Serwer udostępnia oba obrazy pod `/brand/logo.<rozszerzenie>` i `/brand/icon.<rozszerzenie>` z początkiem skrótu pliku w adresie, więc przeglądarki trzymają je na stałe, a nowy plik od razu trafia do wszystkich.

Dwie rzeczy są w `public/` i trafiają do builda: miniatury map podkładowych (`public/thumbs/`, wskazywane przez `thumb` w `map.yaml`; działa też pełny adres https) i `robots.txt`, który pozwala wyszukiwarkom indeksować wszystko. Wdrożenie, które chce innych miniatur lub reguł, podmienia te pliki przed `npm run build`. Gotowy obraz Dockera ma miniatury z repozytorium, więc własne podkłady podają wtedy `thumb` jako pełny adres https albo budują własny obraz.

## Działanie serwera

- **Limity zapytań** na adres klienta (IPv6 liczone po /64): informacja o miejscu 40 naraz i 60 na minutę, słowniki działek 30 i 60, skorowidz ortofotomapy 10 i 30, Nominatim 10 i 30, zgłoszenia 3 naraz i potem jedno na 10 minut. Do usług źródłowych serwer otwiera najwyżej 24 połączenia naraz, ponad to odpowiada 503. Limity liczy każda instancja osobno; Caddy kieruje jednego odwiedzającego zawsze do tej samej repliki. Za proxy ustaw `TRUSTED_PROXY=1`, inaczej wszyscy dzielą limit adresu proxy.
- **Content Security Policy**: skrypty, style i czcionki tylko z serwisu, obrazy z dowolnego adresu https (kafle i obrazy usług), połączenia tylko do serwisu (i usług wyszukiwarki GUGiK, gdy moduł jest włączony). `frame-ancestors 'none'`: strony nie da się osadzić w ramce na innej stronie.
- **Konfiguracja w kontenerze** jest w `/app/config`, tylko do odczytu; może zawierać `skins/`, `i18n/`, `content/`, `seed/` i `brand/`. Dane są w `/data` i są tylko pamięcią podręczną: wolumen można wyczyścić, serwer odbuduje je sam.
- **Punkty kontrolne**: `GET /api/health` (`{ ok, capabilitiesGeneratedAt }`), `GET /api/config` (konfiguracja przekazywana aplikacji), `GET /api/report` (`{ enabled }`: czy formularz zgłoszeń działa), `GET /api/capabilities`, `GET /api/catalog` (moduł gugik).
- **Logi**: na standardowym wyjściu; błędy usług źródłowych i powody wyłączenia formularza zgłoszeń (brak serwera poczty albo nadawcy); brak `APP_ORIGIN` daje tylko ostrzeżenie, że zgłoszenia nie będą zawierać linku do widoku mapy. Na SIGTERM serwer kończy trwające zapytania, najdłużej 10 sekund.

Bezpieczeństwo i budowa serwera: [Architektura](architektura.md).

## Zmienne środowiskowe

Ustawia się je w środowisku albo w pliku `.env` w katalogu aplikacji (wzór z opisami: `.env.example`; plik `.env` nie trafia do repozytorium).

| Zmienna                                 | Domyślnie                                   | Znaczenie                                                                                                                        |
| --------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_DIR`                            | `config`                                    | Katalog konfiguracji wdrożenia.                                                                                                  |
| `DATA_DIR`                              | `server/data`                               | Katalog danych serwera (zob. niżej). Musi być zapisywalny.                                                                       |
| `PORT`                                  | `8787`                                      | Port serwera.                                                                                                                    |
| `HOST`                                  | `0.0.0.0` w produkcji, `127.0.0.1` poza nią | Adres nasłuchu. Za proxy na tej samej maszynie: `127.0.0.1`.                                                                     |
| `NODE_ENV`                              |                                             | `production`: serwer udostępnia też zbudowaną aplikację z `dist/`. Obraz Dockera ustawia ją sam.                                 |
| `APP_ORIGIN`                            |                                             | Publiczny adres aplikacji, np. `https://mapa.example.org`. Zgłoszenia mogą zawierać link tylko do niego; bez niego są bez linku. |
| `TRUSTED_PROXY`                         |                                             | `1` za reverse proxy dopisującym adres klienta do `X-Forwarded-For`; limity zapytań liczą się wtedy dla każdego klienta.         |
| `SHARED_DATA`                           |                                             | `1`, gdy kilka instancji dzieli `DATA_DIR`: dane zapisuje tylko `npm run update`, instancje wczytują je ponownie w ciągu minuty. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | `587`, STARTTLS                             | Serwer poczty dla formularza zgłoszeń; port 465 oznacza TLS od początku, `SMTP_SECURE` tylko to zmienia.                         |
| `SMTP_USER`, `SMTP_PASS`                |                                             | Logowanie do serwera poczty. Tylko w `.env` lub w środowisku, nigdy w konfiguracji.                                              |
| `REPORT_FROM`, `REPORT_TO`              |                                             | Nadawca (domyślnie `SMTP_USER`) i adresat zgłoszeń. Bez `SMTP_HOST`, `REPORT_TO` i nadawcy formularz jest wyłączony.             |
| `API_PORT`                              | `8787`                                      | Tylko przy pracy nad aplikacją: gdzie serwer Vite znajduje API.                                                                  |

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
