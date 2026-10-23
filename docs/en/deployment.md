# Deployment

## Development

```bash
npm install
npm run dev # the app and the API, both restarting on code changes
CONFIG_DIR=examples/osm npm run dev # another deployment
```

`npm run check` runs the type check, ESLint, Prettier and the tests.

## One server

```bash
npm run build
NODE_ENV=production npm start
```

The server serves the app and the API on `PORT` (8787). Put a reverse proxy with HTTPS in front of it (Caddy, nginx) and set `TRUSTED_PROXY=1`.

Data the server keeps between starts (service metadata, the geoportal catalog, dictionaries) lives in `DATA_DIR`. Refresh it once a day:

```bash
npm run update
```

A fresh data directory starts with `seed/capabilities.json` of the configuration directory, when there is one. Without it a single server starts at once without the services' metadata (scale limits, legends) and fetches it in the background, as it does the geoportal catalog; browsers get it with the next page load. The server never waits for the services before it starts.

## Brand

What makes a deployment look like its own, without touching the code:

- **Name and texts**: `name`, `title`, `description` and `tagline` in `app.yaml`, the welcome window and the accessibility statement in Markdown (see [Texts and languages](texts-and-languages.md)).
- **Colours**: a skin (see [Skins](skins.md)).
- **The sign of the app**: `icon` in `app.yaml`, an image inside the configuration directory. It replaces the built-in sign in the bar and the welcome window, the browser tab icon, the home-screen icon and the image of link previews. Without it the app uses its own sign, drawn in the colours of the skin, and the icons in `public/` (`favicon.ico`, `favicon.svg`, `apple-touch-icon.png`).
- **The author's logo**: `author.logo` in `app.yaml`, shown on a white plate next to "Made by" in the corner of the map, the welcome window and the "More" menu; without it the author's name.

The server serves both images at `/brand/logo.<extension>` and `/brand/icon.<extension>` with the start of the file's hash in the address, so browsers keep them for good and a new file reaches everyone at once.

Two things live in `public/` and go into the build: the thumbnails of the base maps (`public/thumbs/`, named by `thumb` in `map.yaml`; a full https address works too) and `robots.txt`, which lets search engines index everything. A deployment that wants other thumbnails or other rules replaces these files before `npm run build`.

## Containers

`compose.yaml` runs the whole service: Caddy in front (certificates, HTTP/2 and HTTP/3), several replicas of the app on a shared data volume and one updater that refreshes the data once a day.

```bash
DOMAIN=example.org docker compose up -d
docker compose pull && docker compose up -d # update to a new image
docker compose up -d --scale app=4 # more replicas
docker compose up -d --build # built from this checkout instead of pulled
```

- **Caddy** gets a certificate for `DOMAIN` by itself and answers on ports 80, 443 and 443/UDP (HTTP/3). It spreads visitors over the replicas and keeps each visitor with one replica, so the rate limits counted there apply to the visitor as a whole. Request bodies are limited to 64 KB.
- **The replicas** (`SHARED_DATA=1`) never build the caches themselves: they read what the updater writes, within a minute of a change. Each answers `GET /api/health`, which the image's health check and Caddy use.
- **The updater** runs `npm run update` at start and then every day.

On a server whose own nginx or Apache serves several sites, `compose.proxy.yaml` leaves Caddy out and runs one replica reachable only on `127.0.0.1:8787` (`COMPOSE_FILE=compose.yaml:compose.proxy.yaml` in `.env`); `deploy/nginx/minigeoportal.conf` is the matching nginx site, and `certbot --nginx` adds the certificate.

Your own configuration goes in by replacing the `./config` mount of `compose.yaml` with your directory. Mail settings and other secrets go into `.env` next to `compose.yaml`; it is optional.

The image is published by GitHub Actions as `ghcr.io/envirosolutionspl/minigeoportal` (tags `latest`, `sha-<commit>` and version numbers) for x86 (64-bit) servers. It is built only when something that goes into it changes (the `config/content/*.md` texts too); documentation alone builds nothing but is still checked by the tests. The image runs without root, needs no build tools at runtime and stops cleanly on SIGTERM. Run alone:

```bash
docker run -p 8787:8787 -v minigeoportal-data:/data ghcr.io/envirosolutionspl/minigeoportal
```

## Running the server

- **Rate limits** per client address (IPv6 counted by /64): place information 40 at once and 60 a minute, parcel dictionaries 30 and 60, the orthophoto index 10 and 30, Nominatim 10 and 30, bug reports 3 at once and then one in 10 minutes. The server opens at most 24 connections to the upstream services at a time and answers 503 beyond that. Each instance counts on its own; Caddy sends a visitor always to the same replica. Behind a proxy set `TRUSTED_PROXY=1`, otherwise everyone shares the proxy's limit.
- **Content Security Policy**: scripts, styles and fonts only from the site, images from any https address (tiles and service images), connections only to the site (and to the GUGiK search services with the module on). `frame-ancestors 'none'`: the page cannot be embedded in a frame on another site.
- **The configuration in the container** is `/app/config`, read-only; it may contain `skins/`, `i18n/`, `content/` and `seed/`. Data is in `/data` and is only a cache: the volume can be wiped, the server rebuilds it.
- **Endpoints to check**: `GET /api/health` (`{ ok, capabilitiesGeneratedAt }`), `GET /api/report` (`{ enabled }`: whether the report form works), `GET /api/capabilities`, `GET /api/catalog` (gugik module).
- **Logs**: on standard output; upstream errors and why the report form is off (no mail server, sender, `APP_ORIGIN`). On SIGTERM the server finishes requests in progress, for 10 seconds at most.

## Environment variables

| Variable                                                                                      | Meaning                                                                                                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`, `HOST`                                                                                | Where the server listens: 8787; `0.0.0.0` in production, `127.0.0.1` otherwise. Behind a proxy on the same machine keep `127.0.0.1`.                      |
| `NODE_ENV`                                                                                    | `production` serves the built app from `dist/`.                                                                                                           |
| `CONFIG_DIR`                                                                                  | The configuration directory (`config`).                                                                                                                   |
| `DATA_DIR`                                                                                    | The data directory (`server/data`).                                                                                                                       |
| `SHARED_DATA`                                                                                 | `1` when several instances share `DATA_DIR`: only `npm run update` writes the caches.                                                                     |
| `TRUSTED_PROXY`                                                                               | `1` behind a reverse proxy that appends the client address to `X-Forwarded-For`; rate limits then count per client.                                       |
| `APP_ORIGIN`                                                                                  | Public address of the app, e.g. `https://example.org`; bug reports may link only to it.                                                                   |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `REPORT_FROM`, `REPORT_TO` | The mail server, sender (`REPORT_FROM`, default `SMTP_USER`) and recipient of bug reports. Without `SMTP_HOST`, `REPORT_TO` and a sender the form is off. |
| `API_PORT`                                                                                    | Development only: where the Vite server finds the API.                                                                                                    |

`.env.example` lists them with examples.
