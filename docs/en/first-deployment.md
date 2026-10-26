# First deployment

A map of your own is a directory of configuration files, with no change to the code. This page goes from a copy of the example to a working map; every field is described in [Configuration](configuration.md).

## 1. The configuration directory

Copy the example and give it a name of your own:

```bash
cp -r examples/osm my-map
```

The directory (files marked `*` are required):

```
my-map/
  app.yaml *                    name, domain, contact, languages, search, modules, report form
  map.yaml *                    coordinate system, scales, first view, tile services, base maps
  layers.yaml *                 topics, layers over the base map, drawing order
  content/welcome.<lang>.md     the welcome window (when app.yaml names content.welcome)
  content/accessibility.<lang>.md    the accessibility statement (when it names content.accessibility)
  i18n/<lang>.yaml              changed interface texts or a new language
  skins/<name>/skin.css         colours of your own (when app.yaml names skin)
  brand/                        the app's sign and the author's logo (when app.yaml names icon, author.logo)
  seed/capabilities.json        service metadata to start with, before the first npm run update
```

## 2. app.yaml

```yaml
id: my-map # lower-case letters, digits, hyphens; prefix of the data kept in the browser
name: Municipal map # or { pl: Mapa gminy, en: Municipal map }
title: 'Municipal map: parcels and plans'
description: A map with the municipality's data.
domain: map.example.org # printed on maps
contact: contact@example.org
author: { name: Town Hall, url: https://example.org }
locales: { default: en, available: [en, pl] }
report:
  categories:
    - { id: map, label: Map or layers }
    - { id: other, label: Other }
search:
  provider: nominatim # gugik | nominatim | none (default none: coordinates only)
  parcel: false # parcel search (gugik module)
```

## 3. map.yaml

```yaml
projection:
  code: EPSG:3857 # the OpenStreetMap tile system; PL-1992 and others with a proj4 field (see config/map.yaml)
  name: Web Mercator # its name on the coordinate bar and on printouts
  axisOrientation: enu # neu when EPSG gives the northing first (e.g. PL-1992)
  extent: [-20037508.34, -20037508.34, 20037508.34, 20037508.34]
zoom:
  # Scale denominators of the zoom levels, largest first (here levels 5–19 of the tile grid).
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
  zoom: 5 # a level of zoom.scales
  home: [2310000, 6820000, 2370000, 6870000] # the extent the map fits at the start
  homeLabel: Whole municipality
  base: osm
attribution: '© [OpenStreetMap](https://www.openstreetmap.org/copyright)'
tileServices:
  - { id: osm, kind: xyz, url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19 }
baseMaps:
  - { id: osm, title: Map, description: OpenStreetMap, sources: [{ service: osm }] }
```

WMS, WMTS and ArcGIS services must serve the map in the system of `projection.code`; the app reprojects nothing in the browser. A PL-1992 deployment with WMTS services: `config/map.yaml`.

## 4. layers.yaml

```yaml
topics:
  - { id: planning, title: Planning }
overlays:
  - id: plans
    kind: wms # wms | wmts | rest
    url: https://wms.example.org/plans
    title: Local plans
    description: Local spatial development plans.
    topic: planning
    starter: true # in the "Most popular" group
    sublayers:
      - { name: zoning, title: Land use, default: true }
```

## 5. Check and start

```bash
npm run config:check my-map           # problems with file, line and column
CONFIG_DIR=my-map npm run dev
npm run update                        # metadata of new services: scale limits, legends
```

Next: [Texts and languages](texts-and-languages.md), [Skins](skins.md), [Search and modules](search-and-modules.md), [Layers that change over time](time-layers.md), and on a server [Deployment](deployment.md).
