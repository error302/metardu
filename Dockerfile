# METARDU Production Dockerfile
# Multi-stage build: deps → build → minimal runtime
FROM node:20-alpine AS deps
WORKDIR /app
# Install node-gyp and canvas dependencies for Alpine
RUN apk add --no-cache python3 make g++ cairo-dev pango-dev libjpeg-turbo-dev giflib-dev
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build requires some env vars to be present (even if empty)
ARG DATABASE_URL=""
ARG AUTH_SECRET="build-placeholder"
ENV DATABASE_URL=$DATABASE_URL
ENV AUTH_SECRET=$AUTH_SECRET
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Install runtime canvas dependencies
RUN apk add --no-cache cairo pango libjpeg-turbo giflib

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build output
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/public/health || exit 1

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]

