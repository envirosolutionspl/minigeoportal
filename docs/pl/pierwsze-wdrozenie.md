# Pierwsze wdrożenie

Własna mapa to katalog plików konfiguracyjnych, bez zmian w kodzie. Ta strona prowadzi od kopii przykładu do działającej mapy; opis każdego pola jest w [Konfiguracji](konfiguracja.md).

## 1. Katalog konfiguracji

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
  brand/                        znak aplikacji i logo autora (gdy app.yaml wskazuje icon, author.logo)
  seed/capabilities.json        metadane usług na start, przed pierwszym npm run update
```

## 2. app.yaml

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
  provider: nominatim # gugik | nominatim | none (domyślnie none: same współrzędne)
  parcel: false # wyszukiwarka działek (moduł gugik)
```

## 3. map.yaml

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
  home: [2310000, 6820000, 2370000, 6870000] # zasięg, do którego mapa dopasowuje się na start
  homeLabel: Cała gmina
  base: osm
attribution: '© [OpenStreetMap](https://www.openstreetmap.org/copyright)'
tileServices:
  - { id: osm, kind: xyz, url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19 }
baseMaps:
  - { id: osm, title: Mapa, description: OpenStreetMap, sources: [{ service: osm }] }
```

Usługi WMS, WMTS i ArcGIS muszą udostępniać mapę w układzie z `projection.code`; aplikacja niczego nie przelicza w przeglądarce. Wdrożenie w PL-1992 z usługami WMTS: `config/map.yaml`.

## 4. layers.yaml

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

## 5. Sprawdzenie i uruchomienie

```bash
npm run config:check moja-mapa        # błędy z plikiem, wierszem i kolumną
CONFIG_DIR=moja-mapa npm run dev
npm run update                        # metadane nowych usług: zakresy skal, legendy
```

Dalej: [Treści i języki](tresci-i-jezyki.md), [Skórki](skorki.md), [Wyszukiwarka i moduły](wyszukiwarka-i-moduly.md), [Warstwy zmienne w czasie](warstwy-czasowe.md), a na serwerze [Wdrożenie](wdrozenie.md).
