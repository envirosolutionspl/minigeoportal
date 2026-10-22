# Deployment

## Development

```bash
npm install
npm run dev # the app and the API, both restarting on changes
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

A fresh data directory starts with `seed/capabilities.json` of the configuration directory, when there is one, and a single server builds the geoportal catalog in the background on its first start.

## Containers

`compose.yaml` runs the whole service: Caddy in front (certificates, HTTP/2 and HTTP/3), several replicas of the app on a shared data volume and one updater that refreshes the data once a day.

```bash
DOMAIN=example.org docker compose up -d --build
docker compose up -d --scale app=4 # more replicas
```

- **Caddy** gets a certificate for `DOMAIN` by itself and answers on ports 80, 443 and 443/UDP (HTTP/3). It spreads visitors over the replicas and keeps each visitor with one replica, so the rate limits counted there apply to the visitor as a whole. Request bodies are limited to 64 KB.
- **The replicas** (`SHARED_DATA=1`) never build the caches themselves: they read what the updater writes, within a minute of a change. Each answers `GET /api/health`, which the image's health check and Caddy use.
- **The updater** runs `npm run update` at start and then every day.

Your own configuration goes in by replacing the `./config` mount of `compose.yaml` with your directory. Mail settings and other secrets go into `.env` next to `compose.yaml`; it is optional.

The image runs without root, needs no build tools at runtime and stops cleanly on SIGTERM. Built alone:

```bash
docker build -t minigeoportal .
docker run -p 8787:8787 -v minigeoportal-data:/data minigeoportal
```

## Environment variables

| Variable                                                                                      | Meaning                                                                                                                              |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `PORT`, `HOST`                                                                                | Where the server listens: 8787; `0.0.0.0` in production, `127.0.0.1` otherwise. Behind a proxy on the same machine keep `127.0.0.1`. |
| `NODE_ENV`                                                                                    | `production` serves the built app from `dist/`.                                                                                      |
| `CONFIG_DIR`                                                                                  | The configuration directory (`config`).                                                                                              |
| `DATA_DIR`                                                                                    | The data directory (`server/data`).                                                                                                  |
| `SHARED_DATA`                                                                                 | `1` when several instances share `DATA_DIR`: only `npm run update` writes the caches.                                                |
| `TRUSTED_PROXY`                                                                               | `1` behind a reverse proxy that appends the client address to `X-Forwarded-For`; rate limits then count per client.                  |
| `APP_ORIGIN`                                                                                  | Public address of the app, e.g. `https://example.org`; bug reports may link only to it.                                              |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `REPORT_FROM`, `REPORT_TO` | The mail server and recipient of bug reports. Without `SMTP_HOST` and `REPORT_TO` the form is off.                                   |
| `API_PORT`                                                                                    | Development only: where the Vite server finds the API.                                                                               |

`.env.example` lists them with examples.
