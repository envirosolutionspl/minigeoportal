# Architektura

## Budowa

- `src/`: aplikacja w React 19, TypeScript i OpenLayers 10, style w Tailwind CSS. Konfigurację dostaje w samej stronie (`src/config/runtime.ts`), bez dodatkowego zapytania.
- `server/`: lekki serwer (Hono) bez bazy danych: konfiguracja (`server/config/`), pamięć podręczna metadanych usług, pośrednik zapytań o punkt, wyszukiwarka Nominatim, wysyłka zgłoszeń.
- `server/modules/gugik/` i `src/modules/gugik/`: opcjonalna integracja z geoportal.gov.pl: katalog wszystkich warstw geoportalu budowany z jego konfiguracji i sprawdzany usługa po usłudze, kolejność rysowania, słowniki wyszukiwarki działek, skorowidz ortofotomapy, wyszukiwarka GUGiK, link do raportu o działce.
- `i18n/`: napisy interfejsu (pl, en); `skins/`: skórki dołączone do aplikacji.
- `Dockerfile`, `compose.yaml`, `deploy/caddy/`: kontenery z Caddy; `compose.proxy.yaml`, `deploy/nginx/`: wariant za istniejącym nginx.

Obrazy usług pobiera przeglądarka wprost od ich serwerów, w układzie mapy, więc niczego nie przelicza. Przez serwer idą tylko zapytania o punkt (informacje o miejscu), słowniki i wyszukiwarka Nominatim.

## Bezpieczeństwo

API nie ma kont ani danych użytkowników.

- Serwer łączy się z adresami usług tylko po sprawdzeniu, że to http(s) na typowym porcie, a host wskazuje adresy publiczne (także przy każdym przekierowaniu), więc nie da się nim sięgnąć do sieci wewnętrznej.
- Zapytania o punkt przyjmują tylko usługi z konfiguracji lub z katalogu, a każdy parametr jest sprawdzany i budowany na nowo; odpowiedzi są czytane z limitem rozmiaru i czasu.
- Limity zapytań na adres klienta i limit równoległych połączeń do usług źródłowych; wyszukiwarka Nominatim wysyła najwyżej jedno zapytanie na sekundę. Szczegóły: [Wdrożenie](wdrozenie.md#działanie-serwera).
- `app.yaml`, `map.yaml` i `layers.yaml` nie mogą zawierać sekretów (klucze wyglądające na hasła i tokeny są odrzucane), a treści Markdown nie mogą wstawić HTML ani skryptów.
- Nagłówki: Content Security Policy budowana z konfiguracji, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.

## Jakość

`npm run check` uruchamia kontrolę typów, ESLint (reguły TypeScript, React hooks, dostępności), Prettier i testy (Vitest): serwerowe w Node, aplikacji w jsdom. Testy obejmują reguły WCAG biblioteki axe-core, kontrast każdej skórki, kompletność tłumaczeń i opis każdego pola konfiguracji w dokumentacji. Każda zmiana ma test w tym samym commicie.

## Dane

Aplikacja pobiera dane na bieżąco z usług wskazanych w konfiguracji i ich nie przechowuje. Za dane odpowiadają ich wydawcy; informacje mają charakter poglądowy.
