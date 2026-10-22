# Wdrożenie

## Praca nad aplikacją

```bash
npm install
npm run dev # aplikacja i API, odświeżane przy zmianach
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

Nowy katalog danych zaczyna od `seed/capabilities.json` z katalogu konfiguracji, jeśli jest, a pojedynczy serwer przy pierwszym starcie buduje w tle katalog geoportalu.

## Kontenery

`compose.yaml` uruchamia cały serwis: Caddy na wejściu (certyfikaty, HTTP/2 i HTTP/3), kilka replik aplikacji na wspólnym wolumenie danych i jeden proces aktualizujący dane raz dziennie.

```bash
DOMAIN=example.org docker compose up -d --build
docker compose up -d --scale app=4 # więcej replik
```

- **Caddy** sam uzyskuje certyfikat dla `DOMAIN` i odpowiada na portach 80, 443 i 443/UDP (HTTP/3). Rozdziela odwiedzających między repliki i trzyma każdego przy jednej, więc liczone tam limity zapytań dotyczą odwiedzającego jako całości. Treść zapytań jest ograniczona do 64 KB.
- **Repliki** (`SHARED_DATA=1`) nigdy same nie budują danych: czytają to, co zapisze proces aktualizujący, w ciągu minuty od zmiany. Każda odpowiada na `GET /api/health`, z którego korzysta kontrola zdrowia obrazu i Caddy.
- **Proces aktualizujący** uruchamia `npm run update` przy starcie, a potem codziennie.

Własną konfigurację podłącza się, zastępując w `compose.yaml` montowany katalog `./config` swoim. Ustawienia poczty i inne sekrety trafiają do `.env` obok `compose.yaml`; plik jest opcjonalny.

Obraz działa bez uprawnień roota, nie potrzebuje w działaniu narzędzi do budowania i poprawnie kończy pracę na SIGTERM. Samodzielnie:

```bash
docker build -t minigeoportal .
docker run -p 8787:8787 -v minigeoportal-data:/data minigeoportal
```

## Zmienne środowiskowe

| Zmienna                                                                                       | Znaczenie                                                                                                                                       |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`, `HOST`                                                                                | Gdzie serwer nasłuchuje: 8787; `0.0.0.0` w produkcji, w pozostałych przypadkach `127.0.0.1`. Za proxy na tej samej maszynie zostaw `127.0.0.1`. |
| `NODE_ENV`                                                                                    | `production` serwuje zbudowaną aplikację z `dist/`.                                                                                             |
| `CONFIG_DIR`                                                                                  | Katalog konfiguracji (`config`).                                                                                                                |
| `DATA_DIR`                                                                                    | Katalog danych (`server/data`).                                                                                                                 |
| `SHARED_DATA`                                                                                 | `1`, gdy kilka instancji dzieli `DATA_DIR`: dane zapisuje tylko `npm run update`.                                                               |
| `TRUSTED_PROXY`                                                                               | `1` za reverse proxy, które dopisuje adres klienta do `X-Forwarded-For`; limity zapytań liczą się wtedy dla każdego klienta.                    |
| `APP_ORIGIN`                                                                                  | Publiczny adres aplikacji, np. `https://example.org`; zgłoszenia mogą zawierać link tylko do niego.                                             |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `REPORT_FROM`, `REPORT_TO` | Serwer poczty i adresat zgłoszeń błędów. Bez `SMTP_HOST` i `REPORT_TO` formularz jest wyłączony.                                                |
| `API_PORT`                                                                                    | Tylko przy pracy nad aplikacją: gdzie serwer Vite znajduje API.                                                                                 |

`.env.example` wymienia je wszystkie z przykładami.
