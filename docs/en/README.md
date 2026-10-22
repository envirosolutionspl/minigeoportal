# MiniGeoportal: overview

MiniGeoportal shows public map services (WMS, WMTS, ArcGIS REST, XYZ tiles) in a map that is quick to load and easy to use for people who do not work with maps. It runs as one small Node server that serves the app and a thin API; there is no database.

Everything that makes a deployment its own lives in a **configuration directory**:

```
config/
  app.yaml          name, languages, search, modules, report form, skin, texts
  map.yaml          coordinate system, zoom levels, first view, base maps and tile services
  layers.yaml       topics, layers over the base map, drawing order
  content/          Markdown texts per language: welcome.en.md, accessibility.en.md
  i18n/             changes to the interface texts, or a new language
  skins/            a skin of your own (colours)
  seed/             service metadata to start with before the first update (optional)
```

The repository ships two deployments:

- `config/`: Prosty Geoportal (prostygeoportal.pl), on the services of the Polish Head Office of Geodesy and Cartography (GUGiK) in PL-1992 (EPSG:2180), with the `gugik` module.
- `examples/osm/`: OpenStreetMap tiles in Web Mercator (EPSG:3857), the Nominatim search and one WMS overlay, without any GUGiK service.

Run the example:

```bash
CONFIG_DIR=examples/osm npm run dev
```

## How a deployment reaches the browser

The server reads the configuration directory when it starts and stops with a list of every problem it finds, each with its file, line and column. It then puts the configuration, with every text already in the visitor's language, into the page itself, so the app starts without waiting for one more request. A change of the configuration takes effect after a restart of the server (in development the server restarts by itself).

Only the fields the app needs go to the browser; nothing secret may be written into the files at all: a key that looks like a password, token or API key is refused. Secrets (the mail server password) belong in environment variables.

## Further reading

- [Configuration](configuration.md): every field of `app.yaml`, `map.yaml` and `layers.yaml`.
- [Texts and languages](texts-and-languages.md): Markdown pages, interface texts, adding a language.
- [Skins](skins.md): colours of the interface.
- [Search and modules](search-and-modules.md): GUGiK, Nominatim or coordinates only; the `gugik` module.
- [Layers that change over time](time-layers.md): the `time` block of a layer.
- [Deployment](deployment.md): Docker, Caddy, several instances, environment variables, data updates.
