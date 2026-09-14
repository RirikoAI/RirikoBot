# syntax=docker/dockerfile:1
FROM node:24.19.0-bookworm-slim AS dependencies

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@10.34.5

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/discord/package.json ./packages/discord/package.json
COPY apps/bot/package.json ./apps/bot/package.json
COPY apps/cli/package.json ./apps/cli/package.json

FROM dependencies AS build
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm build

# A separate install preserves workspace links without shipping build/test dependencies.
FROM dependencies AS production-dependencies
RUN pnpm install --prod --frozen-lockfile

FROM node:24.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production \
    DATABASE_DIALECT=sqlite \
    DATABASE_URL=/app/data/ririko.db \
    HEALTH_HOST=127.0.0.1 \
    HEALTH_PORT=3001
WORKDIR /app

COPY --from=production-dependencies /app/package.json ./package.json
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/packages ./packages
COPY --from=production-dependencies /app/apps ./apps
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/database/dist ./packages/database/dist
COPY --from=build /app/packages/discord/dist ./packages/discord/dist
COPY --from=build /app/apps/bot/dist ./apps/bot/dist
COPY --from=build /app/apps/cli/dist ./apps/cli/dist

RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME ["/app/data"]
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.HEALTH_PORT || '3001') + '/health/ready', { signal: AbortSignal.timeout(4000) }).then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "apps/bot/dist/index.js"]
