# Deployment

Three ways to run the service, simplest first: Docker Compose with Caddy (certificates and HTTP/3 on their own), Docker behind an nginx that already runs on the server, or plain Node without Docker. All of them use the same configuration directory (see [First deployment](first-deployment.md)).

## Requirements

- Node.js 22.18 or newer (the server is TypeScript run directly by Node, without transpiling), or Docker with Compose.
- Map services reachable over https: the browser loads their images, and the page and its Content Security Policy allow https only.
- For a public deployment: a domain pointing at the server and open ports 80 and 443 (TCP) and 443 (UDP, HTTP/3).

## Development

```bash
npm install
npm run dev # the app and the API, both restarting on code changes
CONFIG_DIR=examples/osm npm run dev # another deployment
```

`npm run dev` runs the app (Vite, port 5173) and the API (port 8787). The page reads the configuration on every load, and the API restarts by itself on changes in `config/`; with another `CONFIG_DIR` restart the API by hand. `npm run check` runs the type check, ESLint, Prettier and the tests.

## Docker Compose (recommended)

GitHub Actions publishes a ready image as `ghcr.io/envirosolutionspl/minigeoportal` (tags `latest`, `sha-<commit>` and version numbers) for x86 (64-bit) servers. It is built only when something that goes into it changes (the `config/content/*.md` texts too); documentation alone builds nothing but is still checked by the tests. The image runs without root, needs no build tools at runtime and stops cleanly on SIGTERM. The server builds nothing, it only pulls the image.

1. On the server, clone the repository (`compose.yaml`, `deploy/` and the configuration directory are needed) and put your configuration directory in it.
2. In `compose.yaml`, replace the mounted `./config` directory with yours, in the `app` and `updater` services: `- ./my-map:/app/config:ro`.
3. Create `.env` next to `compose.yaml` (template: `.env.example`) with the domain and, if the report form should work, the mail settings. The domain has to be in `.env`, as Compose reads it on every command; without it the app and Caddy get `localhost`.
4. Start:

```bash
printf 'DOMAIN=map.example.org\n' >> .env
docker compose up -d
docker compose pull && docker compose up -d    # update to a new image
docker compose up -d --scale app=3             # more app replicas
docker compose logs -f app                     # logs
docker compose up -d --build                   # built from this checkout instead of pulled
```

What `compose.yaml` runs:

| Service   | Role                                                                                                                                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `caddy`   | The way in from the internet: gets a certificate for `DOMAIN` by itself, HTTP/2 and HTTP/3 on ports 80, 443 and 443/UDP. It spreads visitors over the replicas and keeps each with one, so the rate limits counted there apply to the visitor as a whole. Request bodies up to 64 KB.             |
| `app`     | The app and the API (port 8787 on the Compose network, not reachable from outside), 2 replicas by default with `SHARED_DATA=1` and `TRUSTED_PROXY=1`. The replicas never build the data themselves: they read what `updater` writes, within a minute of a change. Each answers `GET /api/health`. |
| `updater` | The same image; refreshes the data (`node server/update.ts`, the same as `npm run update`) at start and then every 24 hours.                                                                                                                                                                      |

Volumes: `data` (the server's data, `/data` in the containers), `caddy-data` and `caddy-config` (Caddy's certificates). The configuration is mounted read-only; after changing it, `docker compose up -d --force-recreate app updater` is enough. Mail settings and other secrets go into `.env`.

The image alone, without Compose:

```bash
docker run -p 8787:8787 -v minigeoportal-data:/data ghcr.io/envirosolutionspl/minigeoportal
```

## Docker behind an existing proxy (nginx)

When nginx (or Apache) already serves several sites on the server, Caddy is not needed. The `compose.proxy.yaml` overlay runs one app replica reachable only locally, on `127.0.0.1:8787`:

```bash
printf 'DOMAIN=map.example.org\nCOMPOSE_FILE=compose.yaml:compose.proxy.yaml\n' >> .env
docker compose up -d
```

A template nginx site (with a `www` redirect) is in `deploy/nginx/minigeoportal.conf`; `certbot --nginx -d map.example.org -d www.map.example.org --redirect` adds the certificate.

## One server without Docker

```bash
npm ci
npm run build
NODE_ENV=production HOST=127.0.0.1 TRUSTED_PROXY=1 \
  CONFIG_DIR=/etc/minigeoportal DATA_DIR=/var/lib/minigeoportal \
  APP_ORIGIN=https://map.example.org npm start
```

The server serves the app and the API on `PORT` (8787). `HOST=127.0.0.1` is needed together with `TRUSTED_PROXY=1`: otherwise someone connecting directly could give a false client address and get round the rate limits. Put a reverse proxy with HTTPS in front of it, e.g. Caddy:

```
map.example.org {
	reverse_proxy 127.0.0.1:8787
}
```

Data the server keeps between starts (service metadata, the geoportal catalog, dictionaries) lives in `DATA_DIR`. Refresh it once a day, e.g. with cron:

```
0 4 * * * cd /srv/minigeoportal && CONFIG_DIR=/etc/minigeoportal DATA_DIR=/var/lib/minigeoportal npm run update
```

A fresh data directory starts with `seed/capabilities.json` of the configuration directory, when there is one. Without it a single server starts at once without the services' metadata (scale limits, legends) and fetches it in the background, as it does the geoportal catalog; browsers get it with the next page load. The server never waits for the services before it starts. Any service manager runs it as a system service (systemd, pm2); on SIGTERM it finishes requests in progress and stops.

## Brand

What makes a deployment look like its own, without touching the code:

- **Name and texts**: `name`, `title`, `description` and `tagline` in `app.yaml`, the welcome window and the accessibility statement in Markdown (see [Texts and languages](texts-and-languages.md)).
- **Colours**: a skin (see [Skins](skins.md)).
- **The sign of the app**: `icon` in `app.yaml`, an image inside the configuration directory. It replaces the built-in sign in the bar and the welcome window, the browser tab icon, the home-screen icon and the image of link previews. Without it the app uses its own sign, drawn in the colours of the skin, and the icons in `public/` (`favicon.ico`, `favicon.svg`, `apple-touch-icon.png`).
- **The author's logo**: `author.logo` in `app.yaml`, shown on a white plate next to "Made by" in the corner of the map, the welcome window and the "More" menu; without it the author's name.

The server serves both images at `/brand/logo.<extension>` and `/brand/icon.<extension>` with the start of the file's hash in the address, so browsers keep them for good and a new file reaches everyone at once.

Two things live in `public/` and go into the build: the thumbnails of the base maps (`public/thumbs/`, named by `thumb` in `map.yaml`; a full https address works too) and `robots.txt`, which lets search engines index everything. A deployment that wants other thumbnails or other rules replaces these files before `npm run build`. The ready Docker image has the repository's thumbnails, so base maps of your own then give `thumb` as a full https address or build an image of their own.

## Running the server

- **Rate limits** per client address (IPv6 counted by /64): place information 40 at once and 60 a minute, parcel dictionaries 30 and 60, the orthophoto index 10 and 30, Nominatim 10 and 30, bug reports 3 at once and then one in 10 minutes. The server opens at most 24 connections to the upstream services at a time and answers 503 beyond that. Each instance counts on its own; Caddy sends a visitor always to the same replica. Behind a proxy set `TRUSTED_PROXY=1`, otherwise everyone shares the proxy's limit.
- **Content Security Policy**: scripts, styles and fonts only from the site, images from any https address (tiles and service images), connections only to the site (and to the GUGiK search services with the module on). `frame-ancestors 'none'`: the page cannot be embedded in a frame on another site.
- **The configuration in the container** is `/app/config`, read-only; it may contain `skins/`, `i18n/`, `content/`, `seed/` and `brand/`. Data is in `/data` and is only a cache: the volume can be wiped, the server rebuilds it.
- **Endpoints to check**: `GET /api/health` (`{ ok, capabilitiesGeneratedAt }`), `GET /api/config` (the configuration given to the app), `GET /api/report` (`{ enabled }`: whether the report form works), `GET /api/capabilities`, `GET /api/catalog` (gugik module).
- **Logs**: on standard output; upstream errors and why the report form is off (no mail server or sender); a missing `APP_ORIGIN` only gives a warning that reports will carry no link to the map view. On SIGTERM the server finishes requests in progress, for 10 seconds at most.

Security and how the server is built: [Architecture](architecture.md).

## Environment variables

Set them in the environment or in a `.env` file in the app directory (template with descriptions: `.env.example`; `.env` never goes into the repository).

| Variable                                | Default                                        | Meaning                                                                                                                          |
| --------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_DIR`                            | `config`                                       | The deployment's configuration directory.                                                                                        |
| `DATA_DIR`                              | `server/data`                                  | The server's data directory (see below). Must be writable.                                                                       |
| `PORT`                                  | `8787`                                         | The server's port.                                                                                                               |
| `HOST`                                  | `0.0.0.0` in production, `127.0.0.1` otherwise | The listening address. Behind a proxy on the same machine: `127.0.0.1`.                                                          |
| `NODE_ENV`                              |                                                | `production`: the server also serves the built app from `dist/`. The Docker image sets it.                                       |
| `APP_ORIGIN`                            |                                                | Public address of the app, e.g. `https://map.example.org`. Bug reports may link only to it; without it they carry no link.       |
| `TRUSTED_PROXY`                         |                                                | `1` behind a reverse proxy that appends the client address to `X-Forwarded-For`; rate limits then count per client.              |
| `SHARED_DATA`                           |                                                | `1` when several instances share `DATA_DIR`: only `npm run update` writes the data, the instances read it again within a minute. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | `587`, STARTTLS                                | The mail server for the report form; port 465 means TLS from the start, `SMTP_SECURE` only overrides that.                       |
| `SMTP_USER`, `SMTP_PASS`                |                                                | Login to the mail server. Only in `.env` or the environment, never in the configuration.                                         |
| `REPORT_FROM`, `REPORT_TO`              |                                                | Sender (default `SMTP_USER`) and recipient of bug reports. Without `SMTP_HOST`, `REPORT_TO` and a sender the form is off.        |
| `API_PORT`                              | `8787`                                         | Development only: where the Vite server finds the API.                                                                           |

## Paths and files

| Path                                  | Contents                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `<CONFIG_DIR>/`                       | The deployment's configuration (see [Configuration](configuration.md)).                                |
| `<CONFIG_DIR>/seed/capabilities.json` | Service metadata to start with when `DATA_DIR` is empty (optional).                                    |
| `<DATA_DIR>/capabilities.json`        | Service metadata from their GetCapabilities: scale limits, legends, place information formats.         |
| `<DATA_DIR>/gugik/catalog.json`       | The catalog of geoportal.gov.pl layers (`gugik` module).                                               |
| `<DATA_DIR>/gugik/dict/`              | Dictionaries of the parcel search: voivodeships, counties, municipalities, precincts (`gugik` module). |
| `dist/`                               | The built app (`npm run build`), with compressed `.br` and `.gz` copies.                               |
| `skins/`, `i18n/`                     | Skins and interface texts shipped with the app.                                                        |

## Commands

| Command                            | What it does                                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                      | Development: the app and the API, reloading on changes.                                                                    |
| `npm run build`                    | Builds the app into `dist/`.                                                                                               |
| `npm start`                        | The server (with `NODE_ENV=production` the app too).                                                                       |
| `npm run update`                   | Refreshes the server's data: service metadata and, with the `gugik` module, the geoportal layer catalog (a minute or two). |
| `npm run config:check [directory]` | Checks a configuration without starting the server.                                                                        |
| `npm run check`                    | Type check, ESLint, Prettier and the tests.                                                                                |
| `npm test`                         | The tests alone (Vitest).                                                                                                  |
