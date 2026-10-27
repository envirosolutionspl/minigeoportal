# Konfiguracja

Wdrożenie to katalog z trzema plikami YAML: `app.yaml`, `map.yaml` i `layers.yaml`. Serwer czyta go z `CONFIG_DIR` (domyślnie `config`) i sprawdza każde pole; nieznane pola są błędem, więc literówka nie przejdzie niezauważona. Domyślne wdrożenie w `config/` i przykład w `examples/osm/` pokazują większość pól w użyciu; pozostałe (`legend`, `search.nominatim.url` i `viewbox`, `icon`) opisują tabele niżej, a `time` i `skin` osobne strony: [Warstwy zmienne w czasie](warstwy-czasowe.md) i [Skórki](skorki.md).

**Teksty.** Każde pole oznaczone jako _tekst_ to jeden napis albo napis dla każdego języka:

```yaml
title: Mapa gminy
title: { pl: Mapa gminy, en: Municipal map }
```

Język bez własnego tekstu dostaje tekst języka domyślnego.

**Identyfikatory** to litery, cyfry, `_`, `.` i `-`, zaczynające się literą lub cyfrą. Występują w linkach do mapy (`?b=mapa&l=kieg`), więc warto, by były krótkie, i nie należy ich zmieniać, gdy ludzie udostępniają już linki.

**Skale** to mianowniki: `47247.1183` oznacza 1:47 247.

## app.yaml

| Pole          | Znaczenie                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | Krótki identyfikator wdrożenia: małe litery, cyfry i myślniki. Przedrostek wszystkiego, co aplikacja zapisuje w przeglądarce, i część User-Agent serwera.                                                                                                                                                                                                                                                                                                                 |
| `name`        | Nazwa serwisu (_tekst_) w pasku wyszukiwania i w oknie powitalnym. Ostatnie słowo jest w kolorze akcentu (w nazwie z jednego słowa jej ostatnia część od wielkiej litery, np. „Geoportal” w „MiniGeoportal”).                                                                                                                                                                                                                                                             |
| `title`       | Tytuł strony (_tekst_) na karcie przeglądarki i w wyszukiwarkach.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `description` | Opis strony dla wyszukiwarek (_tekst_).                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `domain`      | Adres, pod którym ludzie znają serwis, np. `minigeoportal.pl`; drukowany na mapach.                                                                                                                                                                                                                                                                                                                                                                                       |
| `contact`     | Adres e-mail serwisu.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `admin`       | Adres e-mail administratora: trafiają tam zgłoszenia błędów i błędy krytyczne serwera (zob. [Wdrożenie](wdrozenie.md#błędy-krytyczne)). Aplikacja go nie pokazuje. Bez niego jedno i drugie jest wyłączone (opcjonalnie).                                                                                                                                                                                                                                                 |
| `author`      | `name` i `url` autora, podlinkowane w rogu mapy, oraz `logo`: obraz pokazywany zamiast nazwy (`.svg`, `.png`, `.webp` lub `.jpg`, ścieżka w katalogu konfiguracji, np. `brand/logo.svg`; opcjonalnie). Zob. [Wdrożenie](wdrozenie.md#marka).                                                                                                                                                                                                                              |
| `icon`        | Znak aplikacji na pasku, w oknie powitalnym, na karcie przeglądarki, na ekranie głównym telefonu i w podglądach linków: obraz w katalogu konfiguracji, jak `author.logo` (opcjonalnie). Kwadratowy PNG co najmniej 512×512 działa wszędzie; SVG nie pojawia się w podglądach linków. Bez niego wbudowany znak w kolorach skórki.                                                                                                                                          |
| `locales`     | Języki: `default` i lista dostępnych `available`, np. `{ default: en, available: [pl, en] }`. Przy dwóch i więcej każdy język ma własny adres (`/pl/`, `/en/`), a menu ułatwień ma przełącznik języka; `root` wskazuje język pokazywany pod samym adresem domeny, bez kodu w adresie. Język domyślny dostaje odwiedzający, którego przeglądarka nie prosi o żaden z dostępnych; z niego biorą się też brakujące tłumaczenia (zob. [Treści i języki](tresci-i-jezyki.md)). |
| `tagline`     | Wiersz pod nazwą w oknie powitalnym (_tekst_, opcjonalnie).                                                                                                                                                                                                                                                                                                                                                                                                               |
| `skin`        | Kolory interfejsu: nazwa skórki (zob. [Skórki](skorki.md)); domyślnie `default`.                                                                                                                                                                                                                                                                                                                                                                                          |
| `content`     | Treści w Markdown: `welcome` (okno przy pierwszej wizycie) i `accessibility` (deklaracja dostępności), jako ścieżki w katalogu konfiguracji bez języka. Bez `welcome` przy pierwszej wizycie nie ma okna, bez `accessibility` nie ma linku do deklaracji. Zob. [Treści i języki](tresci-i-jezyki.md).                                                                                                                                                                     |
| `links`       | `fallbackMap`: dokąd odesłać, gdy warstwy nie da się tu pokazać, i `fallbackName`: jak nazwać ją w linkach (_tekst_; bez niego nazwą jest host adresu). Oba opcjonalne.                                                                                                                                                                                                                                                                                                   |
| `report`      | Formularz zgłoszeń błędów: jego `categories`, każda z `id` i `label` (_tekst_), oraz `locale`, język maili do administratora (domyślnie `locales.default`). Zgłoszenia idą e-mailem na adres `admin`, gdy serwer poczty jest ustawiony (zob. [Wdrożenie](wdrozenie.md)).                                                                                                                                                                                                  |
| `search`      | Pole wyszukiwania: `provider` (`gugik`, `nominatim` albo `none`, domyślnie `none`: same współrzędne), `parcel` (wyszukiwarka działek modułu gugik, `true` albo `false`) oraz dla Nominatim `nominatim` z `url` (domyślnie serwer publiczny), `countryCodes` (np. `[pl, de]`) i `viewbox` (`[minLon, minLat, maxLon, maxLat]`, wyniki z tego obszaru są pierwsze). Zob. [Wyszukiwarka i moduły](wyszukiwarka-i-moduly.md).                                                 |
| `modules`     | Opcjonalne części aplikacji. `gugik` z `enabled` i częściami `catalog`, `drawOrder`, `ortho` (`{ service: <usługa kafli>, history: <warstwa archiwalna> }` lub `false`) oraz `parcelReport` (po włączeniu modułu każda domyślnie działa). Zob. [Wyszukiwarka i moduły](wyszukiwarka-i-moduly.md).                                                                                                                                                                         |

## map.yaml

| Pole           | Znaczenie                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projection`   | Układ współrzędnych mapy: `code` (`EPSG:<numer>`), `name` (nazwa, pod którą ludzie go znają, np. PL-1992; na pasku współrzędnych i wydrukach), `proj4` (definicja, niepotrzebna dla EPSG:3857 i EPSG:4326), `axisOrientation` (`neu`, gdy definicja EPSG podaje najpierw northing, jak PL-1992; w pozostałych przypadkach `enu`) i `extent` (`[minX, minY, maxX, maxY]`, mapy nie da się przesunąć poza ten zasięg). Usługi są pytane o obrazy w tym układzie, więc przeglądarka nigdy ich nie przelicza. |
| `zoom`         | `scales`: poziomy przybliżenia jako mianowniki skali, od największego do najmniejszego. Linki zapisują numer poziomu, więc zmiana listy zmienia stare linki.                                                                                                                                                                                                                                                                                                                                              |
| `tileGrid`     | Siatka kafli wspólna dla usług WMTS, używana, zanim ich capabilities trafią do pamięci: `origin` (`[x, y]` lewego górnego narożnika), `tileSize` (piksele), `matrixSet` (identyfikator) i `matrixIdPrefix` (identyfikatory macierzy to przedrostek i numer poziomu). Potrzebna, gdy są usługi WMTS.                                                                                                                                                                                                       |
| `view`         | Widok startowy: `home` (zasięg, do którego mapa dopasowuje się przy wejściu bez widoku w linku, i zasięg przycisku „cały obszar”), `center` (`[x, y]`) i `zoom` (poziom z `zoom.scales`): widok tuż przed tym dopasowaniem, `homeLabel` (_tekst_, jego nazwa), `base` (podkład), `baseMobile` (podkład na telefonach, opcjonalnie), `toggleBase` (podkład, na który przełącza duża miniatura i z którego wraca, opcjonalnie) oraz `overlays` (warstwy włączone na starcie).                               |
| `timeTravel`   | Podróż w czasie (opcjonalnie): `layers` to warstwy z `layers.yaml` z blokiem `time`, każda z `id`, `label` (_tekst_ na przełączniku paska) i opcjonalnie `base` (podkład pod tą warstwą), rysowane pojedynczo na wybraną datę nad podkładem warstwy albo `base` całej podróży; podkład jest wymuszany, póki podróż trwa, i to z nim kurtyna porównuje wybraną datę. Zob. [Warstwy zmienne w czasie](warstwy-czasowe.md).                                                                                  |
| `attribution`  | Źródło danych mapy (_tekst_): można używać linków Markdown, `'Dane: [Urząd](https://example.org)'`.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `tileServices` | Usługi kafli, z których składają się podkłady. Każda ma `id` i `kind`: `wmts` z `url`, `layer`, `format` (np. `image/png`), `firstLevel` i `levels` (które poziomy przybliżenia publikuje) albo `xyz` z `url` (z `{z}`, `{x}` i `{y}`) i `maxZoom` (opcjonalnie).                                                                                                                                                                                                                                         |
| `baseMaps`     | Podkłady tak, jak ludzie je wybierają: `id`, `title` i `description` (_tekst_), `thumb` (mała miniatura, opcjonalnie) oraz `sources`: usługi kafli, każda z `service` i opcjonalnie `minScale` oraz `maxScale` (usługa jest rysowana, gdy mianownik skali wynosi co najmniej `minScale` i mniej niż `maxScale`), więc jeden podkład może zmieniać usługi wraz ze skalą. Podkład bez źródeł to puste tło.                                                                                                  |

## layers.yaml

| Pole        | Znaczenie                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------- |
| `topics`    | Tematy listy warstw: `id` i `title` (_tekst_).                                                    |
| `drawOrder` | Identyfikatory warstw, najniższa rysowana pierwsza (opcjonalnie; domyślnie kolejność `overlays`). |
| `overlays`  | Warstwy rysowane nad podkładem, opisane niżej.                                                    |

Każda warstwa z `overlays`:

| Pole                   | Znaczenie                                                                                                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                   | Identyfikator warstwy, używany w linkach.                                                                                                                                                                                                                                                                          |
| `kind`                 | `wms`, `wmts` albo `rest` (usługa mapowa ArcGIS REST).                                                                                                                                                                                                                                                             |
| `url`                  | Adres usługi; https, bo obrazy wczytuje przeglądarka.                                                                                                                                                                                                                                                              |
| `title`, `description` | Nazwa i jednowierszowy opis na liście warstw (_tekst_).                                                                                                                                                                                                                                                            |
| `topic`                | Identyfikator tematu.                                                                                                                                                                                                                                                                                              |
| `keywords`             | Słowa, po których wyszukiwarka warstw też ją znajduje: lista albo lista dla każdego języka (`{ pl: [...], en: [...] }`).                                                                                                                                                                                           |
| `starter`              | `true` umieszcza warstwę w pierwszej grupie listy warstw.                                                                                                                                                                                                                                                          |
| `catalogId`            | Identyfikator tej samej warstwy w zewnętrznym katalogu (geoportal.gov.pl z modułem gugik): katalog pokazuje wtedy w jej miejscu tę warstwę, a warstwa przejmuje kolejność rysowania z katalogu.                                                                                                                    |
| `opacity`              | Krycie od 0 do 1 (domyślnie 1).                                                                                                                                                                                                                                                                                    |
| `attribution`          | Źródło danych tej warstwy (_tekst_, linki Markdown dozwolone); w przeciwnym razie źródło mapy.                                                                                                                                                                                                                     |
| `sublayers`            | Warstwy usługi do wyboru, w kolejności listy: `name` (tak, jak nazywa ją usługa), `title` (_tekst_), `default` (`true` dla włączanych razem z warstwą) i `legend` (adres https obrazu legendy, opcjonalnie; w przeciwnym razie legenda z usługi). Zakresy skal i zapytania o punkt wynikają z capabilities usługi. |
| `time`                 | Dla warstwy zmiennej w czasie, zob. [Warstwy zmienne w czasie](warstwy-czasowe.md).                                                                                                                                                                                                                                |

### Warstwy każdego rodzaju

Zakresy skal, legendy, formaty informacji o miejscu i wymiary czasu serwer odczytuje z capabilities usługi raz na dobę (pojedynczy serwer sam, repliki przez proces aktualizujący), przy `npm run update` i przy starcie z pustym katalogiem danych, bez `seed/`; w `layers.yaml` wystarczy adres i nazwy warstw.

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

Po dodaniu warstwy: `npm run config:check`, potem `npm run update`, żeby serwer pobrał capabilities nowej usługi. Sam restart tego nie zrobi, gdy katalog danych już istnieje.

## Sprawdzanie konfiguracji

`npm run config:check examples/osm` sprawdza katalog bez uruchamiania serwera. Sam serwer nie uruchomi się z konfiguracją, która ma problemy, i wypisze każdy z miejscem:

```
Configuration has 2 problems:
  map.yaml:58:13 tileServices.0.format: Invalid string: must match pattern /^image\//
  map.yaml:44:9 view.base: unknown base map "mapka"
```

Każdy adres, który wczytuje przeglądarka (usługi kafli, warstwy), musi być https. Serwer sprawdza też odwołania między plikami (podkłady, usługi, tematy, warstwy z `view.overlays` i `drawOrder`), czy język domyślny ma wszystkie treści Markdown, czy skórka istnieje i czy w plikach nie ma niczego, co wygląda na sekret.
