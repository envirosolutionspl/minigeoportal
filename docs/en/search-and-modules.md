# Search and modules

## The search box

`app.yaml` chooses one search provider:

```yaml
search:
  provider: nominatim # gugik, nominatim or none
  parcel: false
```

- **`gugik`**: addresses, places, administrative units, rivers, lakes, peaks and parcels, from the services of the Polish Head Office of Geodesy and Cartography. Results appear while typing. A chosen address is outlined with its building, a town with its boundary. Needs the `gugik` module.
- **`nominatim`**: places and addresses from OpenStreetMap. It searches after Enter, not while typing, since the server must follow the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/):
  - at most one request a second for the whole service;
  - the app names itself in the User-Agent;
  - answers are remembered, so the same search costs nothing the second time;
  - with a queue too long the server answers 503 and the result list stays empty.

  For heavy use, run a Nominatim of your own and set `search.nominatim.url`. `countryCodes` limits results to some countries, `viewbox` puts results inside an area first.

- **`none`**: no search service.

With every provider the box understands coordinates:

- latitude and longitude: `52.2318, 21.0067` or `52,2318 21,0067`;
- a point in the map's system, written the way its users write it (in PL-1992 X, the northing, first: `486980 637000`).

`parcel: true` adds the parcel search by voivodeship, county, municipality, precinct and number (gugik module).

## The gugik module

The integration with geoportal.gov.pl is a module that a deployment switches on in `app.yaml`:

```yaml
modules:
  gugik:
    enabled: true
    catalog: true # every layer of geoportal.gov.pl in the layer list
    drawOrder: true # the drawing order of geoportal.gov.pl for the configured layers
    ortho: { service: orto, history: orto-archiwalna } # the date of the photo at a clicked place, and the photo archive
    topo: { history: mapy-dawne } # the years of the topographic map sheets in the time view
    parcelReport: true # a link to the parcel report of geoportal.gov.pl
    elevation: true # the height of the terrain in the place panel and the "Terrain profile" tool
```

The module works in PL-1992 only. With another `projection.code`, a configuration that enables it is refused.

### catalog: every layer of the geoportal

The layer list shows every layer of geoportal.gov.pl by topic. Layers that cannot be shown here are greyed out with the reason.

- The server reads the configuration of geoportal.gov.pl, checks every service (six at a time) and keeps the result in `<DATA_DIR>/gugik/catalog.json`.
- A single server refreshes the catalog itself once a day; `npm run update` does it at once (a minute or two). Every server reads the new file within a minute.
- On its first start a single server builds the catalog in the background. Until then `/api/catalog` answers 503 and the list shows only the layers of `layers.yaml`. Replicas with `SHARED_DATA=1` wait for the updater.
- Only the catalog follows changes on geoportal.gov.pl. The layers of `layers.yaml` stay as configured (see [Architecture](architecture.md#data-and-refresh)).
- The catalog sorts layers into the topics `dzialki`, `planowanie`, `ceny`, `uzbrojenie`, `granice`, `teren`, `srodowisko`, `zagrozenia`, `zabytki`, `archiwalne`, `pobieranie`, `geodezja` and `inne`. `layers.yaml` must define them in `topics`; the configuration check names the missing ones.

### drawOrder: drawing order

Configured layers with a `catalogId` are drawn in the order of geoportal.gov.pl. When it cannot be read, `layers.drawOrder` applies.

### ortho: the date of a photo and the photo archive

- `service` is the tile service of `map.yaml` that shows the aerial photos (`orto` by default). While a base map drawn by it is on screen, the place panel gives the date of the photo and a link to download its sheet. `false` turns this part off.
- `history` is the layer of `layers.yaml` with the archive of these photos (with a `time` block). When `map.yaml` names it in `timeTravel`, the time view's slider holds only the dates the photo index knows at the middle of the map. The place panel then counts the archived photos and leads into the view.

### topo: old topographic maps

`history` is the layer of `layers.yaml` (a series of editions) with the scans of old topographic maps. When `map.yaml` names it in `timeTravel`, the time view asks the map index for the sheets at the middle of the map and shows their years. The year is the sheet's "cartographic currency": the year the map's content is current for, neither the date of the scan nor the name of the system. Each year draws its own sheets.

Without this part, the slider holds the editions of the series from `layers.yaml` (names of coordinate systems, not years). `false` turns this part off.

### parcelReport: the parcel report

A link in the place panel to the parcel report of geoportal.gov.pl.

### elevation: terrain heights and the terrain profile

Heights come from the elevation model of GUGiK (NMT, a 1 m grid, the service `services.gugik.gov.pl/nmt`). The browser asks it directly.

- **The place panel** gives the height of the clicked point.
- **Terrain profile** is a tool of its own: a button under the measurement on a computer, an entry of "More" on a phone. You draw a line on the map as for a distance measurement, and its panel shows:
  - a chart of the height along the line (up to 101 points, no closer than a metre);
  - the points where the line bends, marked with a dashed line, with their height above the chart and their distance from the start under it;
  - a summary: the range of heights, the steepest slope between neighbouring points and the mean slope.

  A new line replaces the last one, and closing the tool takes it off the map.

- Where the model has no data (abroad, at sea), the place panel has no height line and the profile leaves such points out.

### What else depends on the module

The GUGiK search (`search.provider: gugik`) and the parcel search (`search.parcel`) need the module too. Without it, the server has none of its routes and the page connects to no GUGiK host.

The module lives in its own directories: `src/modules/gugik/` (the browser side, with its texts) and `server/modules/gugik/` (routes, caches, rules of the configuration). The rest of the app reaches it only through two registries: `src/modules/index.ts` and `server/modules/index.ts`. The module's parts in the browser (the search, the parcel search, the parts of the place panel) are separate files, downloaded only when the module is on. A deployment without it never loads its code.

### Texts of the module

The module brings its texts in `src/modules/gugik/i18n/pl.yaml` and `en.yaml`. They join the app's own only when the module is enabled:

- `search.gugik.*` and `search.parcel*`: the GUGiK search and the parcel button;
- `parcel.*`: the parcel search;
- `layers.catalog*`: loading the geoportal.gov.pl list;
- `info.parcelReport*`: the parcel report link;
- `info.height`: the height of the terrain;
- `info.photo*`, `info.pixel`, `info.downloadSheet`: the date of the aerial photo.

A deployment changes them in its `i18n/<lang>.yaml` like any other text, and a new language translates them there (see [Texts and languages](texts-and-languages.md#adding-a-language-step-by-step)).

The app's own texts name no GUGiK service. The default configuration words some of them for its data in `config/i18n/` (`layers.searchPlaceholder`, `layers.why.token`, `layers.why.refused`, `info.noLayers`, `report.intro`).
