FROM node:20-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json postcss.config.mjs ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/db/package.json packages/db/package.json

RUN --mount=type=cache,id=homeos-pnpm-store,target=/pnpm/store \
    corepack enable \
    && corepack prepare pnpm@9.15.9 --activate \
    && pnpm config set store-dir /pnpm/store \
    && pnpm install --frozen-lockfile

COPY apps ./apps
COPY packages ./packages
COPY lib/db/migrations ./lib/db/migrations
COPY scripts/migrate.cjs ./scripts/migrate.cjs

RUN cd apps/web && ./node_modules/.bin/vite build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["sh", "-c", "node scripts/migrate.cjs && exec node --import tsx apps/server/src/index.ts"]
