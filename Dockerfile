# Prosty Geoportal: the app and its API in one image. Build: docker build -t prosty-geoportal .
# Run with compose.yaml (Caddy in front, several replicas, one updater) or alone:
#   docker run -p 8787:8787 -v geoportal-data:/data prosty-geoportal

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DATA_DIR=/data \
    CONFIG_DIR=/app/config
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# The server runs its TypeScript directly (Node type stripping); it shares a few modules with the app.
COPY server ./server
COPY shared ./shared
COPY src ./src
COPY config ./config
COPY skins ./skins
COPY --from=build /app/dist ./dist
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD wget -qO- http://127.0.0.1:8787/api/health >/dev/null || exit 1
CMD ["node", "server/index.ts"]
