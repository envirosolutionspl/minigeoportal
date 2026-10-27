# Konfiguracja

Wdrożenie to katalog z trzema plikami YAML: `app.yaml`, `map.yaml` i `layers.yaml`. Serwer czyta go z `CONFIG_DIR` (domyślnie `config`) i sprawdza każde pole. Nieznane pole jest błędem, więc literówka nie przejdzie niezauważona.

Najwięcej pól pokazują w użyciu `config/` (minigeoportal.pl) i `examples/osm/`. Warstwy z datami i skórki mają osobne strony: [Warstwy zmienne w czasie](warstwy-czasowe.md) i [Skórki](skorki.md).

Trzy zasady wspólne dla wszystkich plików:

- **Teksty.** Pole oznaczone jako _tekst_ to jeden napis albo napis dla każdego języka. Język bez własnego tekstu dostaje tekst języka domyślnego.

  ```yaml
  title: Mapa gminy
  title: { pl: Mapa gminy, en: Municipal map }
  ```

- **Identyfikatory** to litery, cyfry, `_`, `.` i `-`, na początku litera lub cyfra. Trafiają do linków (`?b=mapa&l=kieg`), więc niech będą krótkie. Nie zmieniaj ich, gdy ludzie udostępniają już linki.
- **Skale** to mianowniki: `47247.1183` oznacza 1:47 247.

## app.yaml

Serwis, języki, wyszukiwarka i moduły.

- `id`: krótki identyfikator wdrożenia (małe litery, cyfry, myślniki). Przedrostek danych zapisywanych w przeglądarce i część User-Agent serwera.
- `name`: nazwa serwisu (_tekst_) w pasku wyszukiwania i oknie powitalnym. Ostatnie słowo jest w kolorze akcentu; w nazwie z jednego słowa jej ostatnia część od wielkiej litery („Geoportal” w „MiniGeoportal”).
- `title`: tytuł strony (_tekst_) na karcie przeglądarki i w wyszukiwarkach.
- `description`: opis strony dla wyszukiwarek (_tekst_).
- `domain`: adres, pod którym ludzie znają serwis, np. `minigeoportal.pl`. Drukowany na mapach.
- `contact`: adres e-mail serwisu.
- `admin`: adres e-mail administratora (opcjonalnie). Trafiają tam zgłoszenia błędów i błędy krytyczne serwera (zob. [Wdrożenie](wdrozenie.md#błędy-krytyczne)). Aplikacja go nie pokazuje. Bez niego zgłoszenia i maile o błędach są wyłączone.
- `author`: autor w rogu mapy: `name`, `url` i opcjonalnie `logo`, obraz zamiast nazwy (`.svg`, `.png`, `.webp` lub `.jpg` w katalogu konfiguracji, np. `brand/logo.svg`). Zob. [Wdrożenie](wdrozenie.md#marka).
- `icon`: znak aplikacji (opcjonalnie): na pasku, w oknie powitalnym, na karcie przeglądarki, na ekranie telefonu i w podglądach linków. Obraz w katalogu konfiguracji, jak `author.logo`. Kwadratowy PNG co najmniej 512×512 działa wszędzie; SVG nie pokaże się w podglądach linków. Bez niego wbudowany znak w kolorach skórki.
- `locales`: języki, np. `{ default: en, available: [pl, en] }`.
  - `default`: język dla odwiedzających, których przeglądarka nie prosi o żaden z dostępnych. Uzupełnia też brakujące tłumaczenia.
  - `available`: lista języków. Przy dwóch i więcej każdy ma własny adres (`/pl/`, `/en/`), a menu ułatwień ma przełącznik języka.
  - `root`: język pod samym adresem domeny, bez kodu w adresie (opcjonalnie).
  - Szczegóły: [Treści i języki](tresci-i-jezyki.md).
- `tagline`: wiersz pod nazwą w oknie powitalnym (_tekst_, opcjonalnie).
- `skin`: nazwa skórki, domyślnie `default` (zob. [Skórki](skorki.md)).
- `content`: treści w Markdown, jako ścieżki w katalogu konfiguracji bez kodu języka (zob. [Treści i języki](tresci-i-jezyki.md)).
  - `welcome`: okno przy pierwszej wizycie. Bez niego okna nie ma.
  - `accessibility`: deklaracja dostępności. Bez niej nie ma linku do deklaracji.
- `links`: gdzie odesłać, gdy warstwy nie da się tu pokazać (oba opcjonalne).
  - `fallbackMap`: adres innej mapy.
  - `fallbackName`: jej nazwa w linkach (_tekst_). Bez niej nazwą jest host adresu.
- `report`: formularz zgłoszeń błędów. Zgłoszenia idą e-mailem na adres `admin`, gdy serwer poczty jest ustawiony (zob. [Wdrożenie](wdrozenie.md)).
  - `categories`: kategorie zgłoszeń, każda z `id` i `label` (_tekst_).
  - `locale`: język maili do administratora (domyślnie `locales.default`).
- `search`: pole wyszukiwania (zob. [Wyszukiwarka i moduły](wyszukiwarka-i-moduly.md)).
  - `provider`: `gugik`, `nominatim` albo `none` (domyślnie: same współrzędne).
  - `parcel`: `true` dodaje wyszukiwarkę działek (moduł gugik).
  - `nominatim`: ustawienia Nominatim: `url` (domyślnie serwer publiczny), `countryCodes` (np. `[pl, de]`) i `viewbox` (`[minLon, minLat, maxLon, maxLat]`; wyniki z tego obszaru są pierwsze).
- `modules`: opcjonalne części aplikacji. Na razie jeden moduł, `gugik` (zob. [Wyszukiwarka i moduły](wyszukiwarka-i-moduly.md)):
  - `enabled`: włącza moduł.
  - `catalog`, `drawOrder`, `parcelReport`, `elevation`: części modułu, domyślnie włączone razem z nim.
  - `ortho`: `{ service: <usługa kafli>, history: <warstwa archiwalna> }` albo `false`; domyślnie `{ service: orto }`.
  - `topo`: `{ history: <warstwa archiwalna> }`; działa tylko, gdy jest podane.

## map.yaml

Układ współrzędnych, skale, widok startowy i podkłady.

- `projection`: układ współrzędnych mapy. Usługi są pytane o obrazy w tym układzie, więc przeglądarka niczego nie przelicza.
  - `code`: `EPSG:<numer>`.
  - `name`: nazwa, pod którą ludzie znają układ (np. PL-1992), na pasku współrzędnych i wydrukach.
  - `proj4`: definicja układu; niepotrzebna dla EPSG:3857 i EPSG:4326.
  - `axisOrientation`: `neu`, gdy definicja EPSG podaje najpierw northing (jak PL-1992), w pozostałych przypadkach `enu`.
  - `extent`: `[minX, minY, maxX, maxY]`; mapy nie da się przesunąć poza ten zasięg.
- `zoom`: `scales` to poziomy przybliżenia jako mianowniki skali, od największego do najmniejszego. Linki zapisują numer poziomu, więc zmiana listy zmienia stare linki.
- `tileGrid`: siatka kafli wspólna dla usług WMTS, używana, zanim serwer pobierze ich capabilities. Potrzebna tylko przy usługach WMTS.
  - `origin`: `[x, y]` lewego górnego narożnika.
  - `tileSize`: rozmiar kafla w pikselach.
  - `matrixSet`: identyfikator zestawu macierzy.
  - `matrixIdPrefix`: identyfikator macierzy to ten przedrostek i numer poziomu.
- `view`: widok startowy.
  - `home`: zasięg, do którego mapa dopasowuje się przy wejściu bez widoku w linku. Także zasięg przycisku „cały obszar”, nazwanego `homeLabel` (_tekst_).
  - `center` (`[x, y]`) i `zoom` (numer poziomu z `zoom.scales`): widok tuż przed tym dopasowaniem.
  - `base`: podkład na start; `baseMobile`: inny podkład na telefonach (opcjonalnie).
  - `toggleBase`: podkład, na który przełącza duża miniatura i z którego wraca (opcjonalnie).
  - `overlays`: warstwy włączone na starcie.
- `timeTravel`: podróż w czasie (opcjonalnie; zob. [Warstwy zmienne w czasie](warstwy-czasowe.md)).
  - `layers`: warstwy z `layers.yaml` z blokiem `time`, rysowane pojedynczo na wybraną datę. Każda ma `id`, `label` (_tekst_ na przełączniku paska) i opcjonalnie `base`, własny podkład.
  - `base`: podkład całej podróży. Podkład jest wymuszany, póki podróż trwa, i to z nim kurtyna porównuje wybraną datę.
- `attribution`: źródło danych mapy (_tekst_). Można używać linków Markdown: `'Dane: [Urząd](https://example.org)'`.
- `slowLoad`: po ilu sekundach czekania na kafel lub obraz włączonej warstwy mapa mówi, że warstwa wczytuje się długo (_liczba_, domyślnie 8). Lista warstw oznacza taką warstwę, a mapa pokazuje jeden komunikat z nazwami wolnych warstw. Czas mierzy przeglądarka, bo to ona pobiera obrazy z usług.
- `tileServices`: usługi kafli, z których składają się podkłady. Każda ma `id` i `kind`:
  - `wmts` z `url`, `layer`, `format` (np. `image/png`) oraz `firstLevel` i `levels` (które poziomy przybliżenia publikuje);
  - `xyz` z `url` (z `{z}`, `{x}` i `{y}`) i opcjonalnie `maxZoom`.
- `baseMaps`: podkłady do wyboru.
  - `id`, `title` i `description` (_tekst_), `thumb` (miniatura, opcjonalnie).
  - `sources`: usługi kafli, każda z `service` i opcjonalnie `minScale` i `maxScale`. Usługa jest rysowana, gdy mianownik skali wynosi co najmniej `minScale` i mniej niż `maxScale`, więc podkład może zmieniać usługę wraz ze skalą. Podkład bez źródeł to puste tło.

## layers.yaml

Warstwy nad podkładem.

- `topics`: tematy listy warstw: `id` i `title` (_tekst_).
- `drawOrder`: identyfikatory warstw, najniższa rysowana pierwsza (opcjonalnie; domyślnie kolejność `overlays`).
- `overlays`: warstwy, każda z polami:
  - `id`: identyfikator, używany w linkach.
  - `kind`: `wms`, `wmts` albo `rest` (usługa mapowa ArcGIS REST).
  - `url`: adres usługi, https (obrazy wczytuje przeglądarka).
  - `title`, `description`: nazwa i jednowierszowy opis na liście warstw (_tekst_).
  - `topic`: identyfikator tematu.
  - `keywords`: dodatkowe słowa dla wyszukiwarki warstw: lista albo lista dla każdego języka (`{ pl: [...], en: [...] }`).
  - `starter`: `true` umieszcza warstwę w pierwszej grupie listy.
  - `catalogId`: identyfikator tej samej warstwy w katalogu geoportal.gov.pl (moduł gugik). Katalog pokazuje wtedy w jej miejscu tę warstwę, a ona przejmuje kolejność rysowania z katalogu.
  - `opacity`: krycie od 0 do 1 (domyślnie 1).
  - `attribution`: źródło danych tej warstwy (_tekst_, z linkami Markdown). Bez niego źródło mapy.
  - `sublayers`: warstwy usługi do wyboru, w kolejności listy: `name` (tak jak nazywa ją usługa), `title` (_tekst_), `default` (`true` dla włączanych razem z warstwą) i opcjonalnie `legend` (adres https obrazu legendy; bez niego legenda z usługi).
  - `time`: dla warstwy z datami, zob. [Warstwy zmienne w czasie](warstwy-czasowe.md).

### Warstwy każdego rodzaju

W `layers.yaml` wystarczy adres i nazwy warstw. Resztę (zakresy skal, legendy, formaty informacji o miejscu, wymiary czasu) serwer odczytuje z capabilities usługi: raz na dobę, przy `npm run update` i przy starcie z pustym katalogiem danych.

```yaml
overlays:
  # WMS: name to nazwa warstwy z GetCapabilities; informacja o miejscu przez GetFeatureInfo,
  # gdy warstwa jest odpytywalna (queryable).
  - id: plany
    kind: wms
    url: https://example.org/wms/plany
    title: Plany miejscowe
    topic: planowanie
    sublayers:
      - { name: strefy, title: Strefy, default: true }
      - { name: granice, title: Granice planów }

  # WMTS: usługa musi mieć zestaw macierzy kafli w układzie mapy (projection.code); warstwą WMTS
  # jest pierwsza podwarstwa. Informacja o miejscu, gdy usługa podaje formaty GetFeatureInfo.
  - id: orto2020
    kind: wmts
    url: https://example.org/wmts/orto
    title: Ortofotomapa 2020
    topic: teren
    sublayers:
      - { name: ORTO_2020, title: Zdjęcia 2020, default: true }

  # ArcGIS REST (MapServer): name to numer warstwy usługi (0, 1, 2…); informacja o miejscu
  # przez identify, gdy usługa ma możliwość Query.
  - id: gleby
    kind: rest
    url: https://example.org/arcgis/rest/services/Gleby/MapServer
    title: Mapa glebowa
    topic: srodowisko
    sublayers:
      - { name: '2', title: Kompleksy, default: true }
      - { name: '0', title: Granice }
```

Po dodaniu warstwy uruchom `npm run config:check`, a potem `npm run update`, żeby serwer pobrał capabilities nowej usługi. Sam restart tego nie zrobi, gdy katalog danych już istnieje.

## Sprawdzanie konfiguracji

`npm run config:check examples/osm` sprawdza katalog bez uruchamiania serwera. Serwer z błędną konfiguracją też się nie uruchomi i wypisze każdy problem z miejscem:

```
Configuration has 2 problems:
  map.yaml:58:13 tileServices.0.format: Invalid string: must match pattern /^image\//
  map.yaml:44:9 view.base: unknown base map "mapka"
```

Sprawdzane jest też, czy:

- każdy adres wczytywany przez przeglądarkę (usługi kafli, warstwy, legendy, miniatury) to https;
- odwołania między plikami się zgadzają (podkłady, usługi, tematy, warstwy z `view.overlays` i `drawOrder`);
- język domyślny ma wszystkie treści Markdown, a skórka istnieje;
- w plikach nie ma niczego, co wygląda na sekret.
