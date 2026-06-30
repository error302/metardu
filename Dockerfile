# METARDU Production Dockerfile
# Multi-stage build: deps → build → minimal runtime
FROM node:20-alpine AS deps
WORKDIR /app
# Install node-gyp and canvas dependencies for Alpine
RUN apk add --no-cache python3 make g++ cairo-dev pango-dev libjpeg-turbo-dev giflib-dev
COPY package.json package-lock.json* ./
COPY scripts/ ./scripts/
RUN npm ci --legacy-peer-deps

FROM node:20-alpine AS builder
WORKDIR /app
# Runtime canvas libs needed for static page generation
RUN apk add --no-cache cairo pango libjpeg-turbo giflib
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DISABLE_PWA=true
ENV NODE_OPTIONS="--max-old-space-size=4096"
# Build requires some env vars to be present (even if placeholder)
ARG DATABASE_URL="postgresql://build:build@localhost/build"
ARG AUTH_SECRET="build-placeholder-not-used-at-runtime"
ENV DATABASE_URL=$DATABASE_URL
ENV AUTH_SECRET=$AUTH_SECRET
ENV IGNORE_TYPE_ERRORS=true
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Install runtime canvas dependencies (for PDF/image generation)
RUN apk add --no-cache cairo pango libjpeg-turbo giflib

# NOTE: Python runtime removed — the Python worker runs in its own container.
# If worker scripts are needed, call them via HTTP (PYTHON_COMPUTE_URL).

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build output
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy migration files and unified runner for startup migration
COPY --from=builder /app/src/lib/db/migrations ./migrations
COPY --from=builder /app/scripts/migrate-unified.mjs ./migrate-unified.mjs
COPY docker-entrypoint.sh ./docker-entrypoint.sh

# Worker output directory
RUN mkdir -p /app/download/worker-output && chown -R nextjs:nodejs /app/download



# Strip Windows CRLF line endings and ensure entrypoint is executable
RUN sed -i 's/\r//' ./docker-entrypoint.sh && \
    chmod +x ./docker-entrypoint.sh

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/public/health || exit 1

USER nextjs

EXPOSE 3000

ENTRYPOINT ["sh", "docker-entrypoint.sh"]

