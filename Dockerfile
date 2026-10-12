# METARDU Production Dockerfile
# Multi-stage build: deps → build → minimal runtime
FROM node:22-alpine AS deps
WORKDIR /app
# Install node-gyp and canvas dependencies for Alpine
RUN --mount=type=cache,id=metardu-apk-downloads,target=/var/cache/apk,sharing=locked \
    for attempt in 1 2 3; do \
      apk --cache-dir /var/cache/apk add --update-cache python3 make g++ cairo-dev pango-dev libjpeg-turbo-dev giflib-dev && exit 0; \
      if [ "$attempt" -eq 3 ]; then exit 1; fi; \
      sleep 5; \
    done
COPY package.json package-lock.json* ./
COPY eslint-plugin-metardu/ ./eslint-plugin-metardu/
COPY scripts/patch-cssnano.js ./scripts/patch-cssnano.js
# Use the Node headers already shipped in node:22-alpine instead of letting
# node-gyp download them from unofficial-builds.nodejs.org. Some build
# networks (e.g. the Oracle Cloud VM) time out fetching those headers even
# though the host can reach them, so we point node-gyp at /usr/local.
ENV npm_config_nodedir=/usr/local
# Persist successful package downloads even when a later fetch fails. Limit
# concurrent transfers on slower origins; lockfile integrity remains enforced.
# Dependency security auditing is a separate CI gate, not a build-time fetch.
RUN --mount=type=cache,id=metardu-npm-downloads,target=/root/.npm \
    npm ci --legacy-peer-deps --prefer-offline --no-audit --no-fund \
      --maxsockets=5 --fetch-timeout=600000

FROM deps AS builder
WORKDIR /app
# Reuse the locked install and its canvas libraries. The independent runner
# below receives only standalone output, never this stage's build toolchain.
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ARG DISABLE_PWA=false
ENV DISABLE_PWA=${DISABLE_PWA}
ARG ANALYZE=false
ARG ANALYZE_REPORT_MODE=static
ARG ANALYZE_TARGET=all
ENV ANALYZE=${ANALYZE}
ENV ANALYZE_REPORT_MODE=${ANALYZE_REPORT_MODE}
ENV ANALYZE_TARGET=${ANALYZE_TARGET}
ENV NODE_OPTIONS="--max-old-space-size=4096"
# Public settings are build inputs; private credentials are supplied only to
# the running service. Build placeholders exist only for the build command.
ARG NEXT_PUBLIC_APP_URL="https://metardu.space"
ARG NEXT_PUBLIC_PAYPAL_CLIENT_ID=""
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_PAYPAL_CLIENT_ID=$NEXT_PUBLIC_PAYPAL_CLIENT_ID
# AUDIT FIX (C10, 2026-07-02): Removed IGNORE_TYPE_ERRORS=true — TypeScript
# errors now block production builds. tsc --noEmit passes clean as of
# this commit. If type errors are reintroduced, fix them; do not re-enable.
# AUDIT FIX (2026-07-05): Removed `npx prisma generate` — the Prisma client
# was dead code (src/lib/db/client.ts had 0 importers and has been deleted).
# All DB access goes through src/lib/db.ts (raw pg Pool). This saves ~10s
# of build time and ~50MB of image size.
# T1.1 FIX (2026-07-09): Deleted prisma/schema.prisma entirely — it was
# deprecated dead code with zero importers, zero deps, and a deprecation
# banner prescribing its own deletion. Raw SQL in src/lib/db/migrations/
# is the single source of truth for the schema.
RUN --mount=type=cache,target=/app/.next/cache \
    node --test tests/standalone-packaging.test.mjs && \
    node scripts/verify-runtime-dependencies.mjs && \
    DATABASE_URL="postgresql://build:build@localhost/build" \
    AUTH_SECRET="build-placeholder-not-used-at-runtime" npm run build

# Optional diagnostic target; exported reports never enter public assets.
FROM scratch AS build-analysis
COPY --from=builder /app/.next/analyze/ /

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install runtime canvas dependencies (for PDF/image generation)
RUN --mount=type=cache,id=metardu-apk-downloads,target=/var/cache/apk,sharing=locked \
    for attempt in 1 2 3; do \
      apk --cache-dir /var/cache/apk add --update-cache cairo pango libjpeg-turbo giflib chromium nss freetype harfbuzz font-freefont && exit 0; \
      if [ "$attempt" -eq 3 ]; then exit 1; fi; \
      sleep 5; \
    done

# NOTE: Python runtime removed — the Python worker runs in its own container.
# If worker scripts are needed, call them via HTTP (PYTHON_COMPUTE_URL).

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build output
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy migration files and unified runner for the one-shot migration service
COPY --from=builder /app/src/lib/db/migrations ./migrations
COPY --from=builder /app/scripts/migrate-unified.mjs ./migrate-unified.mjs
# One-shot service provisions the restricted app login, applies migrations,
# then grants only the runtime DML privileges needed by the web application.
COPY --from=builder /app/scripts/provision-runtime-db-role.mjs ./provision-runtime-db-role.mjs
# Post-deploy schema verification gate (deploy.yml runs this in-container)
COPY --from=builder /app/scripts/verify-migrations.mjs ./verify-migrations.mjs
COPY docker-entrypoint.sh ./docker-entrypoint.sh

# Worker output directory
RUN mkdir -p /app/download/worker-output /app/upload /app/.next/cache && \
    chown -R nextjs:nodejs /app/download /app/upload /app/.next/cache



# Strip Windows CRLF line endings and ensure entrypoint is executable
RUN sed -i 's/\r//' ./docker-entrypoint.sh && \
    chmod +x ./docker-entrypoint.sh

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/public/health || exit 1

USER nextjs

EXPOSE 3000

ENTRYPOINT ["sh", "docker-entrypoint.sh"]

