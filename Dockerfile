FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json ./
# Include build tools; install the backend separately without the root postinstall.
RUN npm ci --include=dev --ignore-scripts
COPY index.html vite.config.js tailwind.config.js postcss.config.js ./
COPY scripts/build ./scripts/build
COPY src ./src
COPY shared ./shared
COPY public ./public
RUN npm run build

FROM node:22-bookworm-slim AS backend-builder
WORKDIR /app/server
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json ./
# Upstream sqlite3 prebuilds can target a newer glibc than this base image.
RUN npm ci --omit=dev \
    && npm rebuild sqlite3 --build-from-source --nodedir=/usr/local \
    && node -e "require('sqlite3')" \
    && npm cache clean --force
COPY server ./

FROM node:22-bookworm-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
ENV NODE_ENV=production PORT=5181 SERVER_HOST=0.0.0.0
COPY --from=frontend-builder --chown=node:node /app/dist /app/dist
COPY --from=backend-builder --chown=node:node /app/server /app/server
COPY --chown=node:node shared /app/shared
RUN mkdir -p uploads/images data logs backups && chown -R node:node /app/server
USER node
EXPOSE 5181
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl --fail --silent http://127.0.0.1:5181/api/health || exit 1
CMD ["node", "index.js"]

FROM node:22-bookworm-slim AS development
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --include=dev --ignore-scripts && npm --prefix server ci \
    && npm --prefix server rebuild sqlite3 --build-from-source --nodedir=/usr/local \
    && node -e "require('./server/node_modules/sqlite3')"
COPY . .
ENV NODE_ENV=development PORT=5181 SERVER_HOST=0.0.0.0 BACKGROUND_TASKS_DISABLED=1
EXPOSE 5180 5181
CMD ["sh", "-c", "npm run dev:server & backend=$!; trap 'kill \"$backend\"' EXIT; npm run dev:client"]
