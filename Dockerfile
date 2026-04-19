# ---- Base Stage ----
FROM node:22-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- Dependencies Stage ----
FROM base AS deps
COPY package*.json ./
# Install system dependencies needed for canvas/jspdf if necessary
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg62-turbo-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

RUN npm ci

# ---- Builder Stage ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# We need to ensure environment variables for the build are provided if necessary
# NEXT_PUBLIC_ variables are baked in during build time
RUN npm run build

# ---- Production Runner ----
FROM base AS runner
# Install runtime libraries for document generation
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    libpixman-1-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# Standalone server files
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]

