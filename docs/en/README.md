# MiniGeoportal: overview

MiniGeoportal shows public map services (WMS, WMTS, ArcGIS REST, XYZ tiles) in a map that loads quickly and is easy to use for people who do not work with maps. It is one small Node server: it serves the app and a thin API. There is no database.

Everything that sets one deployment apart from another lives in a **configuration directory**:

```
config/
  app.yaml          name, languages, search, modules, report form, skin, texts
  map.yaml          coordinate system, zoom levels, first view, base maps and tile services
  layers.yaml       topics, layers over the base map, drawing order
  content/          Markdown texts per language: welcome.en.md, accessibility.en.md
  i18n/             changes to the interface texts, or a new language
  skins/            a skin of your own (colours)
  seed/             service metadata to start with, before the first update (optional)
  brand/            the app's sign and the author's logo (optional)
```

The repository ships two deployments:

- `config/`: minigeoportal.pl, on the services of the Polish Head Office of Geodesy and Cartography (GUGiK) in PL-1992 (EPSG:2180), with the `gugik` module.
- `examples/osm/`: OpenStreetMap tiles in Web Mercator (EPSG:3857), the Nominatim search and one WMS overlay, without any GUGiK service.

Run the example:

```bash
CONFIG_DIR=examples/osm npm run dev
```

## How the configuration reaches the browser

1. The server reads the configuration directory when it starts. If anything is wrong, it stops and lists every problem with its file, line and column.
2. It puts the configuration, with every text already in the visitor's language, into the page itself. The app starts without one more request.
3. A change of the configuration takes effect after a restart of the server. In development the server restarts by itself on changes in `config/`; with another `CONFIG_DIR` restart it by hand.

Only the fields the app needs go to the browser. Nothing secret may be written into `app.yaml`, `map.yaml` and `layers.yaml`: a key that looks like a password, token or API key is refused. Secrets (such as the mail server password) belong in environment variables.

## Further reading

- [First deployment](first-deployment.md): from a copy of the example to a working map, step by step.
- [Configuration](configuration.md): every field of `app.yaml`, `map.yaml` and `layers.yaml`.
- [Texts and languages](texts-and-languages.md): Markdown pages, interface texts, a new language.
- [Skins](skins.md): colours of the interface.
- [Search and modules](search-and-modules.md): GUGiK, Nominatim or coordinates only; the `gugik` module with terrain heights.
- [Layers that change over time](time-layers.md): the `time` block of a layer and the time view.
- [Deployment](deployment.md): Docker, Caddy, nginx, a server without Docker, environment variables, commands.
- [Architecture](architecture.md): how it is built, data, security, quality.
