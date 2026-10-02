# Ririko AI 2.0.0 production images (docs/deployment.md section 2.1).
#
#   docker build --target bot-runner -t ririko-bot .
#   docker build --target web-runner -t ririko-web .
#
# Images keep the monorepo layout at /app, so repo-relative paths (assets/, data/, public/cards,
# storage/) resolve against /app as they do in development. Both run as uid/gid 10001.

FROM node:22-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm
WORKDIR /app

# Workspace manifests only, so dependency layers are rebuilt only when a manifest or the lockfile
# changes. Every workspace package.json must be listed here.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/bot/package.json apps/bot/
COPY apps/cli/package.json apps/cli/
COPY apps/web/package.json apps/web/
COPY packages/ai/package.json packages/ai/
COPY packages/core/package.json packages/core/
COPY packages/database/package.json packages/database/
COPY packages/discord/package.json packages/discord/
COPY packages/music/package.json packages/music/
COPY packages/services/package.json packages/services/
# Downloads the pnpm version pinned by `packageManager` once for every later stage.
RUN corepack install

# Full install and TypeScript build of every workspace package (`tsc -b`).
FROM manifests AS build
# The root `prepare` script installs Git hooks; there is no repository here.
ENV HUSKY=0
RUN --mount=type=cache,id=ririko-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY . .
RUN pnpm build

# Next.js production build of the dashboard, in its own stage so bot builds skip it. The build
# cache is not shipped.
FROM build AS web-build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @ririko/web build && rm -rf apps/web/.next/cache

# Production dependencies of the bot and the workspace packages it uses. Lifecycle scripts are
# skipped: the root `prepare` script needs devDependencies, and no runtime dependency needs one
# (better-sqlite3 and the canvas ship prebuilt binaries).
FROM manifests AS bot-deps
RUN --mount=type=cache,id=ririko-pnpm-store,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts --store-dir /pnpm/store \
      --filter @ririko/bot...

# Production dependencies of the dashboard, likewise.
FROM manifests AS web-deps
RUN --mount=type=cache,id=ririko-pnpm-store,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts --store-dir /pnpm/store \
      --filter @ririko/web...

# Shared runtime: no pnpm, no compilers. tini is PID 1 so signals reach Node and child processes
# are reaped. The canvas draws text with the system sans-serif font (DejaVu).
FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates fonts-dejavu-core tini \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 10001 ririko \
  && useradd --uid 10001 --gid ririko --no-create-home --home-dir /nonexistent \
       --shell /usr/sbin/nologin ririko
# The app user has no home directory; fontconfig keeps its cache under $HOME.
ENV NODE_ENV=production \
    HOME=/tmp
WORKDIR /app
ENTRYPOINT ["/usr/bin/tini", "--"]

FROM runtime AS bot-runner
# FFmpeg decodes audio for the built-in player used when Lavalink is not configured.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
# Manifests and node_modules trees, at the paths their relative symlinks expect.
COPY --from=bot-deps /app ./
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/database/dist packages/database/dist
COPY --from=build /app/packages/discord/dist packages/discord/dist
COPY --from=build /app/packages/music/dist packages/music/dist
COPY --from=build /app/packages/ai/dist packages/ai/dist
COPY --from=build /app/packages/services/dist packages/services/dist
COPY --from=build /app/apps/bot/dist apps/bot/dist
COPY assets assets
# App files stay owned by root. Only these directories are writable; named volumes mounted on
# them start with this owner.
RUN mkdir -p data public/cards public/bosses storage/welcomer-backgrounds \
  && chown 10001:10001 data public/cards public/bosses storage/welcomer-backgrounds
# A 1.4.0 data folder mounted read-only at /app/legacy is migrated once on first start
# (docs/migrations.md section 4). Without the mount nothing happens.
ENV DATABASE_DIALECT=sqlite \
    DATABASE_URL=./data/ririko.sqlite \
    LEGACY_DATABASE_PATH=/app/legacy/ririko.db
USER 10001:10001
CMD ["node", "apps/bot/dist/main.js"]

FROM runtime AS web-runner
# Manifests and node_modules trees. Turbopack bundles the workspace packages into .next/server and
# links the native ones it leaves external (better-sqlite3, pg, @napi-rs/canvas) from
# .next/node_modules into node_modules/.pnpm, so no package dist folder is needed.
COPY --from=web-deps /app ./
COPY --from=web-build /app/apps/web/.next apps/web/.next
# `next start` loads next.config.ts and the module it imports.
COPY apps/web/next.config.ts apps/web/
COPY apps/web/src/lib/security-headers.ts apps/web/src/lib/
# Card frames, foils, stars and element emblems for album cards drawn by the dashboard.
COPY assets/tcg assets/tcg
RUN mkdir -p data public/cards storage/welcomer-backgrounds apps/web/.next/cache \
  && chown 10001:10001 data public/cards storage/welcomer-backgrounds apps/web/.next/cache
ENV DATABASE_DIALECT=sqlite \
    DATABASE_URL=./data/ririko.sqlite \
    NEXT_TELEMETRY_DISABLED=1
USER 10001:10001
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
