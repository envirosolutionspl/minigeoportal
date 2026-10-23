# Wdrożenie

## Praca nad aplikacją

```bash
npm install
npm run dev # aplikacja i API, odświeżane przy zmianach kodu
CONFIG_DIR=examples/osm npm run dev # inne wdrożenie
```

`npm run check` uruchamia kontrolę typów, ESLint, Prettier i testy.

## Jeden serwer

```bash
npm run build
NODE_ENV=production npm start
```

Serwer udostępnia aplikację i API na porcie `PORT` (8787). Przed nim powinno stać reverse proxy z HTTPS (Caddy, nginx), a wtedy ustaw `TRUSTED_PROXY=1`.

Dane, które serwer przechowuje między uruchomieniami (metadane usług, katalog geoportalu, słowniki), są w `DATA_DIR`. Odświeżaj je raz dziennie:

```bash
npm run update
```

Nowy katalog danych zaczyna od `seed/capabilities.json` z katalogu konfiguracji, jeśli jest. Bez niego pojedynczy serwer zaczyna od razu bez metadanych usług (zakresów skal, legend) i pobiera je w tle, tak jak katalog geoportalu; przeglądarki dostają je przy następnym wczytaniu strony. Serwer nigdy nie czeka na usługi przed startem.

## Marka

Co sprawia, że wdrożenie wygląda jak własne, bez zmiany kodu:

- **Nazwa i teksty**: `name`, `title`, `description` i `tagline` w `app.yaml`, okno powitalne i deklaracja dostępności w Markdownie (zob. [Treści i języki](tresci-i-jezyki.md)).
- **Kolory**: skórka (zob. [Skórki](skorki.md)).
- **Znak aplikacji**: `icon` w `app.yaml`, obraz w katalogu konfiguracji. Zastępuje wbudowany znak na pasku i w oknie powitalnym, ikonę karty przeglądarki, ikonę na ekranie głównym telefonu i obraz podglądu linku. Bez niego aplikacja używa własnego znaku, rysowanego w kolorach skórki, i ikon z `public/` (`favicon.ico`, `favicon.svg`, `apple-touch-icon.png`).
- **Logo autora**: `author.logo` w `app.yaml`, pokazywane na białym tle obok „Stworzone przez” w rogu mapy, w oknie powitalnym i w menu „Więcej”; bez niego nazwa autora.

Serwer udostępnia oba obrazy pod `/brand/logo.<rozszerzenie>` i `/brand/icon.<rozszerzenie>` z początkiem skrótu pliku w adresie, więc przeglądarki trzymają je na stałe, a nowy plik od razu trafia do wszystkich.

Dwie rzeczy są w `public/` i trafiają do builda: miniatury map podkładowych (`public/thumbs/`, wskazywane przez `thumb` w `map.yaml`; działa też pełny adres https) i `robots.txt`, który pozwala wyszukiwarkom indeksować wszystko. Wdrożenie, które chce innych miniatur lub reguł, podmienia te pliki przed `npm run build`.

## Kontenery

`compose.yaml` uruchamia cały serwis: Caddy na wejściu (certyfikaty, HTTP/2 i HTTP/3), kilka replik aplikacji na wspólnym wolumenie danych i jeden proces aktualizujący dane raz dziennie.

```bash
DOMAIN=example.org docker compose up -d
docker compose pull && docker compose up -d # aktualizacja do nowego obrazu
docker compose up -d --scale app=4 # więcej replik
docker compose up -d --build # obraz zbudowany z lokalnej kopii zamiast pobranego
```

- **Caddy** sam uzyskuje certyfikat dla `DOMAIN` i odpowiada na portach 80, 443 i 443/UDP (HTTP/3). Rozdziela odwiedzających między repliki i trzyma każdego przy jednej, więc liczone tam limity zapytań dotyczą odwiedzającego jako całości. Treść zapytań jest ograniczona do 64 KB.
- **Repliki** (`SHARED_DATA=1`) nigdy same nie budują danych: czytają to, co zapisze proces aktualizujący, w ciągu minuty od zmiany. Każda odpowiada na `GET /api/health`, z którego korzysta kontrola zdrowia obrazu i Caddy.
- **Proces aktualizujący** uruchamia `npm run update` przy starcie, a potem codziennie.

Na serwerze, którego własny nginx lub Apache obsługuje kilka serwisów, `compose.proxy.yaml` pomija Caddy i uruchamia jedną replikę dostępną tylko pod `127.0.0.1:8787` (`COMPOSE_FILE=compose.yaml:compose.proxy.yaml` w `.env`); `deploy/nginx/minigeoportal.conf` to pasująca konfiguracja serwisu w nginx, a certyfikat dodaje `certbot --nginx`.

Własną konfigurację podłącza się, zastępując w `compose.yaml` montowany katalog `./config` swoim. Ustawienia poczty i inne sekrety trafiają do `.env` obok `compose.yaml`; plik jest opcjonalny.

Obraz publikuje GitHub Actions jako `ghcr.io/envirosolutionspl/minigeoportal` (tagi `latest`, `sha-<commit>` i numery wersji) dla serwerów x86 (64-bit). Powstaje tylko wtedy, gdy zmienia się coś, co do niego trafia (także treści `config/content/*.md`); sama dokumentacja go nie przebudowuje, ale jest sprawdzana testami. Obraz działa bez uprawnień roota, nie potrzebuje w działaniu narzędzi do budowania i poprawnie kończy pracę na SIGTERM. Samodzielnie:

```bash
docker run -p 8787:8787 -v minigeoportal-data:/data ghcr.io/envirosolutionspl/minigeoportal
```

## Działanie serwera

- **Limity zapytań** na adres klienta (IPv6 liczone po /64): informacja o miejscu 40 naraz i 60 na minutę, słowniki działek 30 i 60, skorowidz ortofotomapy 10 i 30, Nominatim 10 i 30, zgłoszenia 3 naraz i potem jedno na 10 minut. Do usług źródłowych serwer otwiera najwyżej 24 połączenia naraz, ponad to odpowiada 503. Limity liczy każda instancja osobno; Caddy kieruje jednego odwiedzającego zawsze do tej samej repliki. Za proxy ustaw `TRUSTED_PROXY=1`, inaczej wszyscy dzielą limit adresu proxy.
- **Content Security Policy**: skrypty, style i czcionki tylko z serwisu, obrazy z dowolnego adresu https (kafle i obrazy usług), połączenia tylko do serwisu (i usług wyszukiwarki GUGiK, gdy moduł jest włączony). `frame-ancestors 'none'`: strony nie da się osadzić w ramce na innej stronie.
- **Konfiguracja w kontenerze** jest w `/app/config`, tylko do odczytu; może zawierać `skins/`, `i18n/`, `content/` i `seed/`. Dane są w `/data` i są tylko pamięcią podręczną: wolumen można wyczyścić, serwer odbuduje je sam.
- **Punkty kontrolne**: `GET /api/health` (`{ ok, capabilitiesGeneratedAt }`), `GET /api/report` (`{ enabled }`: czy formularz zgłoszeń działa), `GET /api/capabilities`, `GET /api/catalog` (moduł gugik).
- **Logi**: na standardowym wyjściu; błędy usług źródłowych i powody wyłączenia formularza zgłoszeń (brak serwera poczty, nadawcy, `APP_ORIGIN`). Na SIGTERM serwer kończy trwające zapytania, najdłużej 10 sekund.

## Zmienne środowiskowe

| Zmienna                                                                                       | Znaczenie                                                                                                                                                 |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`, `HOST`                                                                                | Gdzie serwer nasłuchuje: 8787; `0.0.0.0` w produkcji, w pozostałych przypadkach `127.0.0.1`. Za proxy na tej samej maszynie zostaw `127.0.0.1`.           |
| `NODE_ENV`                                                                                    | `production` serwuje zbudowaną aplikację z `dist/`.                                                                                                       |
| `CONFIG_DIR`                                                                                  | Katalog konfiguracji (`config`).                                                                                                                          |
| `DATA_DIR`                                                                                    | Katalog danych (`server/data`).                                                                                                                           |
| `SHARED_DATA`                                                                                 | `1`, gdy kilka instancji dzieli `DATA_DIR`: dane zapisuje tylko `npm run update`.                                                                         |
| `TRUSTED_PROXY`                                                                               | `1` za reverse proxy, które dopisuje adres klienta do `X-Forwarded-For`; limity zapytań liczą się wtedy dla każdego klienta.                              |
| `APP_ORIGIN`                                                                                  | Publiczny adres aplikacji, np. `https://example.org`; zgłoszenia mogą zawierać link tylko do niego.                                                       |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `REPORT_FROM`, `REPORT_TO` | Serwer poczty, nadawca (`REPORT_FROM`, domyślnie `SMTP_USER`) i adresat zgłoszeń błędów. Bez `SMTP_HOST`, `REPORT_TO` i nadawcy formularz jest wyłączony. |
| `API_PORT`                                                                                    | Tylko przy pracy nad aplikacją: gdzie serwer Vite znajduje API.                                                                                           |

`.env.example` wymienia je wszystkie z przykładami.
