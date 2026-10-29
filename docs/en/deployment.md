# Deployment

Three ways to run the service, simplest first:

1. [Docker Compose with Caddy](#docker-compose-recommended): certificates and HTTP/3 set themselves up.
2. [Docker behind an existing nginx](#docker-behind-an-existing-proxy-nginx), when the server already hosts other sites.
3. [Plain Node, without Docker](#one-server-without-docker).

All of them use the same configuration directory (see [First deployment](first-deployment.md)).

## Requirements

- Node.js 22.18 or newer (the server is TypeScript run directly by Node, without transpiling), or Docker with Compose.
- Map services reachable over https: the browser loads their images, and the page allows https only.
- For a public deployment: a domain pointing at the server and open ports 80 and 443 (TCP) and 443 (UDP, HTTP/3).

## Development

```bash
npm install
npm run dev # the app and the API, both restarting on code changes
CONFIG_DIR=examples/osm npm run dev # another deployment
```

`npm run dev` runs the app (Vite, port 5173) and the API (port 8787). The API restarts by itself on changes in `config/`; with another `CONFIG_DIR` restart it by hand. `npm run check` runs the type check, ESLint, Prettier and the tests.

## Docker Compose (recommended)

GitHub Actions publishes a ready image, `ghcr.io/envirosolutionspl/minigeoportal`, for x86 (64-bit) servers, tagged `latest`, `sha-<commit>` and with version numbers. The server builds nothing, it only pulls the image. The image runs without root and stops cleanly on SIGTERM.

1. On the server, clone the repository (`compose.yaml`, `deploy/` and the configuration directory are needed) and put your configuration directory in it.
2. In `compose.yaml`, in the `app` and `updater` services, replace the mounted `./config` directory with yours: `- ./my-map:/app/config:ro`.
3. Create `.env` next to `compose.yaml` (template: `.env.example`) with the domain. If the report form and the alert mails should work, add the mail settings (and set `admin` in `app.yaml`). The domain has to be in `.env`, as Compose reads it on every command; without it the app and Caddy get `localhost`.
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

| Service   | Role                                                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `caddy`   | The way in from the internet. Gets a certificate for `DOMAIN` by itself, serves HTTP/2 and HTTP/3. Sends each visitor always to the same replica. Request bodies up to 64 KB.                                  |
| `app`     | The app and the API (port 8787, reachable only on the Compose network). 2 replicas by default, with `SHARED_DATA=1` and `TRUSTED_PROXY=1`. The replicas never build the data; they read what `updater` writes. |
| `updater` | The same image. Refreshes the data (the same as `npm run update`) at start and then every 24 hours.                                                                                                            |

Good to know:

- After a change of the configuration, `docker compose up -d --force-recreate app updater` is enough. The configuration is mounted read-only.
- Volumes: `data` (the server's data, `/data` in the containers), `caddy-data` and `caddy-config` (Caddy's certificates).
- Every replica may hold 65536 open files (`ulimits` in `compose.yaml`). Docker's default of 1024 caps a replica at about a thousand connections at once.
- Mail settings and other secrets go into `.env`.
- The image is built only when something that goes into it changes (the `config/content/*.md` texts too). Documentation alone builds nothing but is still checked by the tests.

The image alone, without Compose:

```bash
docker run -p 8787:8787 -v minigeoportal-data:/data ghcr.io/envirosolutionspl/minigeoportal
```

## Docker behind an existing proxy (nginx)

When nginx (or Apache) already serves other sites on the server, Caddy is not needed. The `compose.proxy.yaml` overlay runs two app replicas reachable only locally, on `127.0.0.1:8787` and `127.0.0.1:8788`:

```bash
printf 'DOMAIN=map.example.org
COMPOSE_FILE=compose.yaml:compose.proxy.yaml
COMPOSE_PARALLEL_LIMIT=1
' >> .env
docker compose up -d
```

- `COMPOSE_PARALLEL_LIMIT=1` makes an update recreate the replicas one after the other. Meanwhile nginx answers from the one that is up, so an update gives no 502 errors.
- A template nginx site (a `www` redirect, an `upstream` block with both replicas, `keepalive`) is in `deploy/nginx/minigeoportal.conf`.
- In `/etc/nginx/nginx.conf` raise the limits: `worker_rlimit_nofile 65536;` and `worker_connections 4096;`. The default 1024 open files per worker last for about 500 proxied connections.
- Certificate: `certbot --nginx -d map.example.org -d www.map.example.org --redirect`.

## One server without Docker

```bash
npm ci
npm run build
NODE_ENV=production HOST=127.0.0.1 TRUSTED_PROXY=1 \
  CONFIG_DIR=/etc/minigeoportal DATA_DIR=/var/lib/minigeoportal npm start
```

The server serves the app and the API on `PORT` (8787). Put a reverse proxy with HTTPS in front of it, e.g. Caddy:

```
map.example.org {
	reverse_proxy 127.0.0.1:8787
}
```

`HOST=127.0.0.1` is needed together with `TRUSTED_PROXY=1`. Otherwise someone connecting directly could give a false client address and get round the rate limits.

The server keeps data between starts (service metadata, the geoportal catalog, dictionaries) in `DATA_DIR`:

- It refreshes the data itself once a day, so cron is optional.
- `npm run update` refreshes it at once, e.g. after a change of the configuration or at a set hour. The server reads the new data within a minute, without a restart:

  ```
  0 4 * * * cd /srv/minigeoportal && CONFIG_DIR=/etc/minigeoportal DATA_DIR=/var/lib/minigeoportal npm run update
  ```

- A fresh data directory starts with `seed/capabilities.json` of the configuration directory, when there is one. Without it the server starts at once without the services' metadata (scale limits, legends) and fetches it in the background. Browsers get it with the next page load. The server never waits for the services before it starts.

Any service manager runs it as a system service (systemd, pm2). On SIGTERM it finishes requests in progress and stops.

## Brand

What makes a deployment look like its own, without touching the code:

- **Name and texts**: `name`, `title`, `description` and `tagline` in `app.yaml`, the welcome window and the accessibility statement in Markdown (see [Texts and languages](texts-and-languages.md)).
- **Colours**: a skin (see [Skins](skins.md)).
- **The sign of the app**: `icon` in `app.yaml`. It replaces the built-in sign in the bar and the welcome window, the browser tab icon, the home-screen icon and the image of link previews. Without it the app uses its own sign in the colours of the skin and the icons in `public/` (`favicon.ico`, `favicon.svg`, `apple-touch-icon.png`).
- **The author's logo**: `author.logo` in `app.yaml`, on a white plate next to "Made by" in the corner of the map, the welcome window and the "More" menu. Without it, the author's name.

The server serves both images at `/brand/logo.<extension>` and `/brand/icon.<extension>`, with the start of the file's hash in the address. Browsers therefore keep them for good, and a new file reaches everyone at once.

Two things live in `public/` and go into the build:

- the thumbnails of the base maps (`public/thumbs/`, named by `thumb` in `map.yaml`; a full https address works too);
- `robots.txt`, which lets search engines index everything.

A deployment that wants others replaces these files before `npm run build`. The ready Docker image has the repository's thumbnails, so base maps of your own then give `thumb` as a full https address or build an image of their own.

## Running the server

**Rate limits** per client address (IPv6 counted by /64), at once and per minute:

| Requests                               | At once | Per minute             |
| -------------------------------------- | ------- | ---------------------- |
| place information                      | 40      | 60                     |
| parcel dictionaries                    | 30      | 60                     |
| orthophoto and topographic map indexes | 10      | 30                     |
| Nominatim search                       | 10      | 30                     |
| bug reports                            | 3       | then one in 10 minutes |

The server opens at most 24 connections to the upstream services at a time and answers 503 beyond that. Each replica counts on its own, and Caddy sends a visitor always to the same one. Behind a proxy set `TRUSTED_PROXY=1`, otherwise everyone shares the proxy's limit.

**Security headers:**

- Content Security Policy: scripts, styles and fonts only from the site; images from any https address (tiles and service images); connections only to the site, and with the gugik module also to the GUGiK search services, the elevation model and the address geocoder (`services.gugik.gov.pl`).
- `frame-ancestors 'none'`: the page cannot be embedded in a frame on another site.
- `Strict-Transport-Security` for half a year, for the app's host alone (no subdomains), so the proxy need not add it.

**Configuration and data in the container:** the configuration is `/app/config`, read-only; it may contain `skins/`, `i18n/`, `content/`, `seed/` and `brand/`. Data is in `/data` and is only a cache: the volume can be wiped, the server rebuilds it.

**Endpoints to check:**

- `GET /api/health`: `{ ok, capabilitiesGeneratedAt }`;
- `GET /api/config`: the configuration given to the app;
- `GET /api/report`: `{ enabled }`, whether the report form works;
- `GET /api/capabilities`;
- `GET /api/catalog` (gugik module).

**Logs** go to standard output: upstream errors, critical errors (below) and why the report form is off (no mail server, no `admin` in `app.yaml` or no sender). On SIGTERM the server finishes requests in progress, for 10 seconds at most.

## Critical errors

A critical error is something the server cannot fix by itself:

- a configured service (a base map or an overlay of the configuration) did not answer at a refresh of the data;
- a refresh failed as a whole (the first one at start too);
- an error nothing in the server caught. The process then stops, and Docker or the service manager starts it again.

A critical error goes to the log as a line starting with `CRITICAL`. With the mail server set up, it also goes by e-mail to `admin` from `app.yaml` (the same address as the bug reports), in the language of `report.locale`. The same error is mailed at most once a day, and no more than ten errors a day in all.

Layers of the geoportal catalog that do not answer are not critical: there are hundreds of them and some are always down.

In Docker Compose the `updater` service reads `.env` too, so its refresh mails with the same mail server.

Security and how the server is built: [Architecture](architecture.md).

## Environment variables

Set them in the environment or in a `.env` file in the app directory (template with descriptions: `.env.example`; `.env` never goes into the repository).

| Variable                                | Default                                        | Meaning                                                                                                                                                              |
| --------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_DIR`                            | `config`                                       | The deployment's configuration directory.                                                                                                                            |
| `DATA_DIR`                              | `server/data`                                  | The server's data directory. Must be writable.                                                                                                                       |
| `PORT`                                  | `8787`                                         | The server's port.                                                                                                                                                   |
| `HOST`                                  | `0.0.0.0` in production, `127.0.0.1` otherwise | The listening address. Behind a proxy on the same machine: `127.0.0.1`.                                                                                              |
| `NODE_ENV`                              |                                                | `production`: the server also serves the built app from `dist/`. The Docker image sets it.                                                                           |
| `APP_ORIGIN`                            | `https://` + `domain` of `app.yaml`            | Public address of the app when it differs from the domain of `app.yaml` (a staging site, say). Bug reports may link only to it.                                      |
| `TRUSTED_PROXY`                         |                                                | `1` behind a reverse proxy that appends the client address to `X-Forwarded-For`. Rate limits then count per client.                                                  |
| `SHARED_DATA`                           |                                                | `1` when several instances share `DATA_DIR`. Only `npm run update` writes the data then, and the instances read it. Without it the server refreshes the data itself. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | `587`, STARTTLS                                | The mail server for the mails to the administrator (bug reports and critical errors). Port 465 means TLS from the start; `SMTP_SECURE` only overrides that.          |
| `SMTP_USER`, `SMTP_PASS`                |                                                | Login to the mail server. Only in `.env` or the environment, never in the configuration.                                                                             |
| `REPORT_FROM`                           | `SMTP_USER`                                    | Sender of the mails. Without `SMTP_HOST`, `admin` in `app.yaml` and a sender, the report form and the alert mails are off.                                           |
| `API_PORT`                              | `8787`                                         | Development only: where the Vite server finds the API.                                                                                                               |

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
