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
    ortho: true # the date and pixel size of the aerial photo at a clicked place
    parcelReport: true # a link to the parcel report of geoportal.gov.pl
```

It works in PL-1992 only: the configuration is refused when the module is enabled with another `projection.code`.

- **catalog**: the server reads the configuration of geoportal.gov.pl (its layer list and groups), checks every service (six at a time) and keeps the result on disk (`<DATA_DIR>/catalog/catalog.json`); the layer list shows those layers by topic, and layers that cannot be shown here are listed greyed out with the reason. `npm run update` refreshes it (a minute or two). A single server builds it in the background on its first start; until then `/api/catalog` answers 503 and the list shows only the layers of `layers.yaml`; replicas with `SHARED_DATA=1` wait for the updater. The catalog sorts layers into the topics `dzialki`, `planowanie`, `ceny`, `uzbrojenie`, `granice`, `teren`, `srodowisko`, `zagrozenia`, `zabytki`, `archiwalne`, `pobieranie`, `geodezja` and `inne`, so `layers.yaml` must define them in `topics`.
- **drawOrder**: configured layers with a `catalogId` follow the order geoportal.gov.pl draws them in; when it cannot be read, `layers.drawOrder` applies.
- **ortho**: the date of the photo under the orthophoto map, with a link to download its sheet.
- **parcelReport**: a link in the place panel to the parcel report of geoportal.gov.pl.

The GUGiK search (`search.provider: gugik`) and the parcel search (`search.parcel`) need the module too. Without it the server has none of its routes and the page connects to no GUGiK host directly.
