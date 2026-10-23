# Configuration

A deployment is a directory with three YAML files: `app.yaml`, `map.yaml` and `layers.yaml`. The server reads it from `CONFIG_DIR` (`config` by default) and checks every field; unknown fields are errors, so a typo never passes silently. The default deployment in `config/` and the example in `examples/osm/` show most fields in use; the others (`time`, `legend`, `search.nominatim.url` and `viewbox`, `skin`) are described here with examples.

**Texts.** Every field marked _text_ is either one string or one string per language:

```yaml
title: Mapa gminy
title: { pl: Mapa gminy, en: Municipal map }
```

A language that has no text of its own gets the text of the default language.

**Ids** are letters, digits, `_`, `.` and `-`, starting with a letter or digit. They appear in links to the map (`?b=mapa&l=kieg`), so keep them short and do not change them once people share links.

**Scales** are denominators: `47247.1183` means 1:47 247.

## app.yaml

| Field         | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | Short id of the deployment: lowercase letters, digits and dashes. Prefix of everything the app keeps in the browser and part of the server's User-Agent.                                                                                                                                                                                                                                                                                                                                     |
| `name`        | Name of the service (_text_), shown in the search bar and the welcome window. Its last word is drawn in the accent colour.                                                                                                                                                                                                                                                                                                                                                                   |
| `title`       | Title of the page (_text_), shown in the browser tab and in search engines.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `description` | Description of the page for search engines (_text_).                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `domain`      | Address people know the service by, e.g. `minigeoportal.pl`; printed on maps.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `contact`     | E-mail address of the service.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `author`      | `name` and `url` of the author, linked in the corner of the map, and `logo`: an image shown instead of the name (`.svg`, `.png`, `.webp` or `.jpg`, a path inside the configuration directory, e.g. `brand/logo.svg`; optional). See [Deployment](deployment.md#brand).                                                                                                                                                                                                                      |
| `icon`        | The sign of the app in the bar, the welcome window, the browser tab, on the home screen and in link previews: an image inside the configuration directory, like `author.logo` (optional). A square PNG of at least 512×512 works everywhere; an SVG is not shown in link previews. Without it the built-in sign, in the colours of the skin.                                                                                                                                                 |
| `locales`     | Languages: `default` and the list of `available` ones, e.g. `{ default: en, available: [pl, en] }`. With two or more each language has its own address (`/pl/`, `/en/`) and the display menu offers a language switch; `root` names the language shown at the bare domain, without a code in the address. Visitors whose browser asks for none of the available languages get the default one, which also fills in missing translations (see [Texts and languages](texts-and-languages.md)). |
| `tagline`     | A line under the name in the welcome window (_text_, optional).                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `skin`        | Colours of the interface: the name of a skin (see [Skins](skins.md)); `default` when left out.                                                                                                                                                                                                                                                                                                                                                                                               |
| `content`     | Markdown texts: `welcome` (the window shown on the first visit) and `accessibility` (the accessibility statement), as paths inside the configuration directory without the language. Without `welcome` there is no window on the first visit; without `accessibility` no link to a statement. See [Texts and languages](texts-and-languages.md).                                                                                                                                             |
| `links`       | `fallbackMap`: where to send people when a layer cannot be shown here, and `fallbackName`: what to call it in links (_text_; without it, the host of the address). Both optional.                                                                                                                                                                                                                                                                                                            |
| `report`      | The bug report form: its `categories`, each with an `id` and a `label` (_text_), and `locale`, the language of the mails to the administrator (default: `locales.default`). Reports go by e-mail when the mail server is set up (see [Deployment](deployment.md)).                                                                                                                                                                                                                           |
| `search`      | The search box: `provider` (`gugik`, `nominatim` or `none`), `parcel` (the parcel search of the gugik module, `true` or `false`) and, for Nominatim, `nominatim` with `url` (the public server by default), `countryCodes` (e.g. `[pl, de]`) and `viewbox` (`[minLon, minLat, maxLon, maxLat]`, results inside come first). See [Search and modules](search-and-modules.md).                                                                                                                 |
| `modules`     | Optional parts of the app. `gugik` with `enabled` and the parts `catalog`, `drawOrder`, `ortho` (`{ service: <tile service> }` or `false`) and `parcelReport` (each on by default once the module is enabled). See [Search and modules](search-and-modules.md).                                                                                                                                                                                                                              |

## map.yaml

| Field          | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projection`   | The coordinate system of the map: `code` (`EPSG:<number>`), `name` (how people know it, e.g. PL-1992; shown on the coordinate bar and on prints), `proj4` (its definition, not needed for EPSG:3857 and EPSG:4326), `axisOrientation` (`neu` when the EPSG definition puts northing first, as PL-1992 does; `enu` otherwise) and `extent` (`[minX, minY, maxX, maxY]`, the map cannot be moved outside it). Services are asked for images in this system, so the browser never reprojects them. |
| `zoom`         | `scales`: the zoom levels as scale denominators, from the largest to the smallest. Links keep the level as its number, so changing the list changes old links.                                                                                                                                                                                                                                                                                                                                  |
| `tileGrid`     | The tile grid the WMTS services share, used until their capabilities are cached: `origin` (`[x, y]` of the top-left corner), `tileSize` (pixels), `matrixSet` (its identifier) and `matrixIdPrefix` (matrix ids are the prefix and the level number). Needed when there are WMTS services.                                                                                                                                                                                                      |
| `view`         | The first view: `center` (`[x, y]`), `zoom` (a level of `zoom.scales`), `home` (the extent of the first visit and of the "whole area" button), `homeLabel` (_text_, its name), `base` (the base map), `baseMobile` (the base map on phones, optional), `toggleBase` (the base map the large thumbnail switches to and back from, optional) and `overlays` (layers switched on at the start).                                                                                                    |
| `attribution`  | Source credit of the map (_text_): Markdown links are allowed, `'Data: [Office](https://example.org)'`.                                                                                                                                                                                                                                                                                                                                                                                         |
| `tileServices` | Tile services that base maps are built from. Each has an `id` and a `kind`: `wmts` with `url`, `layer`, `format` (e.g. `image/png`), `firstLevel` and `levels` (which of the zoom levels it publishes); or `xyz` with `url` (with `{z}`, `{x}` and `{y}`) and `maxZoom` (optional).                                                                                                                                                                                                             |
| `baseMaps`     | Base maps as people choose them: `id`, `title` and `description` (_text_), `thumb` (a small preview image, optional) and `sources`: tile services, each with `service` and optionally `minScale` and `maxScale` (the service is drawn from 1:minScale and up to 1:maxScale), so one base map can switch services with the scale. A base map without sources is a blank background.                                                                                                              |

## layers.yaml

| Field       | Meaning                                                                           |
| ----------- | --------------------------------------------------------------------------------- |
| `topics`    | Topics of the layer list: `id` and `title` (_text_).                              |
| `drawOrder` | Layer ids, the lowest drawn first (optional; the order of `overlays` by default). |
| `overlays`  | Layers drawn over the base map, described below.                                  |

Each layer of `overlays`:

| Field                  | Meaning                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                   | Id of the layer, used in links.                                                                                                                                                                                                                                                                                                                 |
| `kind`                 | `wms`, `wmts` or `rest` (an ArcGIS REST map service).                                                                                                                                                                                                                                                                                           |
| `url`                  | Address of the service; https, as the browser loads its images.                                                                                                                                                                                                                                                                                 |
| `title`, `description` | Name and one-line description in the layer list (_text_).                                                                                                                                                                                                                                                                                       |
| `topic`                | Id of its topic.                                                                                                                                                                                                                                                                                                                                |
| `keywords`             | Words the layer search also finds it by: a list, or a list per language (`{ pl: [...], en: [...] }`).                                                                                                                                                                                                                                           |
| `starter`              | `true` lists the layer in the first group of the layer list.                                                                                                                                                                                                                                                                                    |
| `catalogId`            | Id of the same layer in an outside catalog (geoportal.gov.pl with the gugik module): the catalog then shows this layer in its place, and the layer takes the catalog's drawing order.                                                                                                                                                           |
| `opacity`              | Opacity from 0 to 1 (1 by default).                                                                                                                                                                                                                                                                                                             |
| `attribution`          | Source credit of this layer (_text_, Markdown links allowed); the map's credit otherwise.                                                                                                                                                                                                                                                       |
| `sublayers`            | The layers of the service people can choose, in the order the list shows them: `name` (as the service names it), `title` (_text_), `default` (`true` for the ones switched on with the layer) and `legend` (a legend image, optional; the service's own legend otherwise). Scale limits and point queries come from the service's capabilities. |
| `time`                 | For a layer that changes over time, see [Layers that change over time](time-layers.md).                                                                                                                                                                                                                                                         |

### Layers of each kind

Scale limits, legends, place information formats and time dimensions are read by the server from the service's capabilities on `npm run update` (and on the first start); `layers.yaml` needs only the address and the layer names.

```yaml
overlays:
  # WMS: name is the layer's name in GetCapabilities; place information through GetFeatureInfo
  # when the layer is queryable.
  - id: plans
    kind: wms
    url: https://example.org/wms/plans
    title: Local plans
    topic: planning
    sublayers:
      - { name: zones, title: Zones, default: true }
      - { name: bounds, title: Plan boundaries }

  # WMTS: the service needs a tile matrix set in the map's system (projection.code); the WMTS
  # layer is the first sublayer. Place information when the service lists GetFeatureInfo formats.
  - id: ortho2020
    kind: wmts
    url: https://example.org/wmts/ortho
    title: Orthophoto 2020
    topic: terrain
    sublayers:
      - { name: ORTHO_2020, title: Photos 2020, default: true }

  # ArcGIS REST (MapServer): name is the service's layer number (0, 1, 2…); place information
  # through identify when the service has the Query capability.
  - id: soils
    kind: rest
    url: https://example.org/arcgis/rest/services/Soils/MapServer
    title: Soil map
    topic: environment
    sublayers:
      - { name: '2', title: Complexes, default: true }
      - { name: '0', title: Boundaries }
```

After adding a layer: `npm run config:check`, then `npm run update` (or a restart), so the server fetches the new service's capabilities.

## Checking a configuration

`npm run config:check examples/osm` checks a directory without starting the server. The server itself refuses to start with a configuration that has problems and lists each with its place:

```
Configuration has 2 problems:
  map.yaml:58:13 tileServices.0.format: Invalid string: must match pattern /^image\//
  map.yaml:44:9 view.base: unknown base map "mapka"
```

Every address the browser loads (tile services, layers) must be https. It also checks references between the files (base maps, services, topics, the layers of `view.overlays` and `drawOrder`), that the default language has every Markdown text, that the skin exists, and that nothing in the files looks like a secret.
