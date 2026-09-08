# Multi-stage build: compile TypeScript in `builder`, ship only the runtime
# essentials in the final image. Node 22 to match @types/node and this
# package's `engines.node` (>=20).

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
# Gotcha: a naive `tsc`-only build silently drops the bundled postal-code
# JSON datasets — `npm run build` copies them into dist/data/ itself.
# plzLookup.ts throws on the first delivery-quote request if they're missing.
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# src/, scripts/, and schema.sql are kept (not just dist/) so
# `npm run db:migrate` (via tsx, run manually — never in CMD, see
# scripts/migrate.ts) works inside this same image.
COPY src ./src
COPY scripts ./scripts
COPY schema.sql ./schema.sql

EXPOSE 8787
# node directly, not `npm start`, so SIGTERM reaches this process for a
# clean shutdown (closes the HTTP server and Postgres pool) instead of
# being absorbed by an npm wrapper process.
CMD ["node", "dist/server.js"]
