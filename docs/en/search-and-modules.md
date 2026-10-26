# Search and modules

## The search box

`app.yaml` chooses one search provider:

```yaml
search:
  provider: nominatim # gugik, nominatim or none
  parcel: false
```

- **`gugik`**: addresses, places, administrative units, rivers, lakes and peaks, and parcels, from the services of the Polish Head Office of Geodesy and Cartography. Results appear while typing; a chosen address is outlined with its building, a town with its boundary. Needs the `gugik` module.
- **`nominatim`**: places and addresses from OpenStreetMap. The server asks Nominatim for everyone, following its [usage policy](https://operations.osmfoundation.org/policies/nominatim/): at most one request a second for the whole service, the app named in the User-Agent, answers remembered (the same search costs nothing the second time). That is why it searches after Enter, not while typing. With a queue too long the server answers 503 and the result list stays empty. For heavy use run a Nominatim of your own and set `search.nominatim.url`. `countryCodes` limits results to some countries, `viewbox` puts results inside an area first.
- **`none`**: no search service.

With every provider the box understands coordinates: latitude and longitude (`52.2318, 21.0067` or `52,2318 21,0067`), or a point in the map's system written the way its users write it (in PL-1992 X, the northing, first: `486980 637000`).

`parcel: true` adds the parcel search by voivodeship, county, municipality, precinct and number (gugik module).

## The gugik module

The integration with geoportal.gov.pl is a module that a deployment switches on:

```yaml
modules:
  gugik:
    enabled: true
    catalog: true # every layer of geoportal.gov.pl in the layer list
    drawOrder: true # the drawing order of geoportal.gov.pl for the configured layers
    ortho: { service: orto, history: orto-archiwalna } # the date of the photo at a clicked place, and the photo archive
    parcelReport: true # a link to the parcel report of geoportal.gov.pl
```

It works in PL-1992 only: the configuration is refused when the module is enabled with another `projection.code`.

- **catalog**: the server reads the configuration of geoportal.gov.pl (its layer list and groups), checks every service (six at a time) and keeps the result on disk (`<DATA_DIR>/gugik/catalog.json`); the layer list shows those layers by topic, and layers that cannot be shown here are listed greyed out with the reason. A single server refreshes it itself once a day, `npm run update` at once (a minute or two); every server reads the new file within a minute. A single server builds it in the background on its first start; until then `/api/catalog` answers 503 and the list shows only the layers of `layers.yaml`; replicas with `SHARED_DATA=1` wait for the updater. The catalog sorts layers into the topics `dzialki`, `planowanie`, `ceny`, `uzbrojenie`, `granice`, `teren`, `srodowisko`, `zagrozenia`, `zabytki`, `archiwalne`, `pobieranie`, `geodezja` and `inne`, so `layers.yaml` must define them in `topics` (the configuration check says which are missing).
- **drawOrder**: configured layers with a `catalogId` follow the order geoportal.gov.pl draws them in; when it cannot be read, `layers.drawOrder` applies.
- **ortho**: the date of the photo under the orthophoto map, with a link to download its sheet. `service` is the tile service of `map.yaml` that shows the photos: the date appears while a base map drawn by it is on screen (`orto` by default; `false` turns the part off). `history` is the layer of `layers.yaml` that shows the archive of these photos (a `time` block): when `map.yaml` names it in `timeTravel`, the time view offers only the dates the photo index has photos of at the middle of the map, and the place panel counts the archived photos and leads into the view.
- **parcelReport**: a link in the place panel to the parcel report of geoportal.gov.pl.

The GUGiK search (`search.provider: gugik`) and the parcel search (`search.parcel`) need the module too. Without it the server has none of its routes and the page connects to no GUGiK host directly.

A module lives in its own directories: `src/modules/gugik/` (the app side, with its texts) and `server/modules/gugik/` (routes, caches, rules of the configuration). The rest of the app reaches it only through two registries, `src/modules/index.ts` and `server/modules/index.ts`. The app's parts of a module (the search, the parcel search, the parts of the place panel) are separate files the browser downloads only when the module is on, so a deployment without it never loads its code.

### Texts of the module

The module brings its texts in `src/modules/gugik/i18n/pl.yaml` and `en.yaml`, added to the app's own only when the module is enabled: `search.gugik.*` and `search.parcel*` (the GUGiK search and the parcel button), `parcel.*` (the parcel search), `layers.catalog*` (loading the geoportal.gov.pl list), `info.parcelReport*` (the parcel report link) and `info.photo*`, `info.pixel`, `info.downloadSheet` (the date of the aerial photo). A deployment changes them in its `i18n/<lang>.yaml` like any other text, and a new language translates them there (see [Texts and languages](texts-and-languages.md#adding-a-language-step-by-step)).

The app's own texts name no GUGiK service; the default configuration words some of them for its data in `config/i18n/` (`layers.searchPlaceholder`, `layers.why.token`, `layers.why.refused`, `info.noLayers`, `report.intro`).
