# Configuration

A deployment is a directory with three YAML files: `app.yaml`, `map.yaml` and `layers.yaml`. The server reads it from `CONFIG_DIR` (`config` by default) and checks every field. An unknown field is an error, so a typo never passes silently.

`config/` (minigeoportal.pl) and `examples/osm/` show most fields in use. Layers with dates and skins have pages of their own: [Layers that change over time](time-layers.md) and [Skins](skins.md).

Three rules apply to every file:

- **Texts.** A field marked _text_ is one string or one string per language. A language without a text of its own gets the text of the default language.

  ```yaml
  title: Mapa gminy
  title: { pl: Mapa gminy, en: Municipal map }
  ```

- **Ids** are letters, digits, `_`, `.` and `-`, starting with a letter or digit. They appear in links (`?b=mapa&l=kieg`), so keep them short. Do not change them once people share links.
- **Scales** are denominators: `47247.1183` means 1:47 247.

## app.yaml

The service, languages, search and modules.

- `id`: short id of the deployment (lowercase letters, digits, dashes). Prefix of the data the app keeps in the browser and part of the server's User-Agent.
- `name`: name of the service (_text_) in the search bar and the welcome window. Its last word is drawn in the accent colour; in a one-word name, its last part starting with a capital ("Geoportal" in "MiniGeoportal").
- `title`: title of the page (_text_) in the browser tab and in search engines.
- `description`: description of the page for search engines (_text_).
- `domain`: the address people know the service by, e.g. `minigeoportal.pl`. Printed on maps.
- `contact`: e-mail address of the service.
- `admin`: e-mail address of the administrator (optional). Bug reports and critical errors of the server go there (see [Deployment](deployment.md#critical-errors)). Never shown in the app. Without it, reports and error mails are off.
- `author`: the author in the corner of the map: `name`, `url` and optionally `logo`, an image shown instead of the name (`.svg`, `.png`, `.webp` or `.jpg` inside the configuration directory, e.g. `brand/logo.svg`). See [Deployment](deployment.md#brand).
- `icon`: the sign of the app (optional): in the bar, the welcome window, the browser tab, on a phone's home screen and in link previews. An image inside the configuration directory, like `author.logo`. A square PNG of at least 512×512 works everywhere; an SVG does not show in link previews. Without it, the built-in sign in the colours of the skin.
- `locales`: languages, e.g. `{ default: en, available: [pl, en] }`.
  - `default`: the language for visitors whose browser asks for none of the available ones. It also fills in missing translations.
  - `available`: the list of languages. With two or more, each has its own address (`/pl/`, `/en/`) and the display menu offers a language switch.
  - `root`: the language at the bare domain, without a code in the address (optional).
  - Details: [Texts and languages](texts-and-languages.md).
- `tagline`: a line under the name in the welcome window (_text_, optional).
- `skin`: the name of a skin, `default` when left out (see [Skins](skins.md)).
- `content`: Markdown texts, as paths inside the configuration directory without the language code (see [Texts and languages](texts-and-languages.md)).
  - `welcome`: the window shown on the first visit. Without it, there is no window.
  - `accessibility`: the accessibility statement. Without it, there is no link to one.
- `links`: where to send people when a layer cannot be shown here (both optional).
  - `fallbackMap`: the address of another map.
  - `fallbackName`: its name in links (_text_). Without it, the host of the address.
- `report`: the bug report form. Reports go by e-mail to `admin` when the mail server is set up (see [Deployment](deployment.md)).
  - `categories`: report categories, each with an `id` and a `label` (_text_).
  - `locale`: the language of the mails to the administrator (default: `locales.default`).
- `search`: the search box (see [Search and modules](search-and-modules.md)).
  - `provider`: `gugik`, `nominatim` or `none` (the default: coordinates only).
  - `parcel`: `true` adds the parcel search (gugik module).
  - `nominatim`: Nominatim settings: `url` (the public server by default), `countryCodes` (e.g. `[pl, de]`) and `viewbox` (`[minLon, minLat, maxLon, maxLat]`; results inside it come first).
- `modules`: optional parts of the app. There is one module so far, `gugik` (see [Search and modules](search-and-modules.md)):
  - `enabled`: switches the module on.
  - `catalog`, `drawOrder`, `parcelReport`, `elevation`, `address`: parts of the module, on by default along with it.
  - `ortho`: `{ service: <tile service>, history: <archival layer> }` or `false`; `{ service: orto }` by default.
  - `topo`: `{ history: <archival layer> }`; on only when given.

## map.yaml

Coordinate system, scales, first view and base maps.

- `projection`: the coordinate system of the map. Services are asked for images in this system, so the browser never reprojects anything.
  - `code`: `EPSG:<number>`.
  - `name`: how people know the system (e.g. PL-1992), shown on the coordinate bar and on prints.
  - `proj4`: its definition; not needed for EPSG:3857 and EPSG:4326.
  - `axisOrientation`: `neu` when the EPSG definition puts northing first (as PL-1992 does), `enu` otherwise.
  - `extent`: `[minX, minY, maxX, maxY]`; the map cannot be moved outside it.
- `zoom`: `scales` are the zoom levels as scale denominators, from the largest to the smallest. Links keep the level as its number, so changing the list changes old links.
- `tileGrid`: the tile grid the WMTS services share, used until the server has their capabilities. Needed only with WMTS services.
  - `origin`: `[x, y]` of the top-left corner.
  - `tileSize`: tile size in pixels.
  - `matrixSet`: id of the tile matrix set.
  - `matrixIdPrefix`: a matrix id is this prefix and the level number.
- `view`: the first view.
  - `home`: the extent the map fits when a link gives no view. Also the extent of the "whole area" button, named by `homeLabel` (_text_).
  - `center` (`[x, y]`) and `zoom` (a level number of `zoom.scales`): the view just before that fit.
  - `base`: the base map at the start; `baseMobile`: another one on phones (optional).
  - `toggleBase`: the base map the large thumbnail switches to and back from (optional).
  - `overlays`: layers switched on at the start.
- `timeTravel`: the time view (optional; see [Layers that change over time](time-layers.md)).
  - `layers`: layers of `layers.yaml` with a `time` block, drawn one at a time as of the chosen date. Each has an `id`, a `label` (_text_ on the bar's switch) and optionally a `base` of its own.
  - `base`: the base map of the whole view. The base map is forced while the view is open, and the curtain compares the chosen date with it.
- `attribution`: source credit of the map (_text_). Markdown links are allowed: `'Data: [Office](https://example.org)'`.
- `slowLoad`: seconds of waiting for a tile or an image of a switched-on layer after which the map says the layer loads slowly (_number_, 8 by default). The layer list marks such a layer, and the map shows one line naming the slow layers. The browser measures the time, since it fetches the images from the services.
- `tileServices`: tile services that base maps are built from. Each has an `id` and a `kind`:
  - `wmts` with `url`, `layer`, `format` (e.g. `image/png`), and `firstLevel` and `levels` (which zoom levels it publishes);
  - `xyz` with `url` (with `{z}`, `{x}` and `{y}`) and optionally `maxZoom`.
- `baseMaps`: the base maps to choose from.
  - `id`, `title` and `description` (_text_), `thumb` (a preview image, optional).
  - `sources`: tile services, each with `service` and optionally `minScale` and `maxScale`. A service is drawn while the scale denominator is at least `minScale` and less than `maxScale`, so a base map can switch services with the scale. A base map without sources is a blank background.

## layers.yaml

Layers over the base map.

- `topics`: topics of the layer list: `id` and `title` (_text_).
- `drawOrder`: layer ids, the lowest drawn first (optional; the order of `overlays` by default).
- `overlays`: the layers, each with the fields:
  - `id`: id of the layer, used in links.
  - `kind`: `wms`, `wmts` or `rest` (an ArcGIS REST map service).
  - `url`: address of the service, https (the browser loads its images).
  - `title`, `description`: name and one-line description in the layer list (_text_).
  - `topic`: id of its topic.
  - `keywords`: more words for the layer search: a list, or a list per language (`{ pl: [...], en: [...] }`).
  - `starter`: `true` lists the layer in the first group of the list.
  - `catalogId`: id of the same layer in the geoportal.gov.pl catalog (gugik module). The catalog then shows this layer in its place, and the layer takes the catalog's drawing order.
  - `opacity`: opacity from 0 to 1 (1 by default).
  - `attribution`: source credit of this layer (_text_, with Markdown links). The map's credit otherwise.
  - `sublayers`: the layers of the service people can choose, in list order: `name` (as the service names it), `title` (_text_), `default` (`true` for the ones switched on with the layer) and optionally `legend` (the https address of a legend image; the service's own legend otherwise).
  - `time`: for a layer with dates, see [Layers that change over time](time-layers.md).

### Layers of each kind

`layers.yaml` needs only the address and the layer names. The rest (scale limits, legends, place information formats, time dimensions) the server reads from the service's capabilities: once a day, on `npm run update` and on a start with an empty data directory.

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

After adding a layer, run `npm run config:check`, then `npm run update`, so the server fetches the new service's capabilities. A restart alone does not, once the data directory exists.

## Checking a configuration

`npm run config:check examples/osm` checks a directory without starting the server. The server does not start with a broken configuration either, and lists each problem with its place:

```
Configuration has 2 problems:
  map.yaml:58:13 tileServices.0.format: Invalid string: must match pattern /^image\//
  map.yaml:44:9 view.base: unknown base map "mapka"
```

It also checks that:

- every address the browser loads (tile services, layers, legends, thumbnails) is https;
- references between the files match (base maps, services, topics, the layers of `view.overlays` and `drawOrder`);
- the default language has every Markdown text, and the skin exists;
- nothing in the files looks like a secret.
