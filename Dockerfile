# ---- Production Runner (pre-built on host) ----
FROM node:22-slim

# Install runtime libraries + curl for healthcheck
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

WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# Copy the pre-built application
COPY .next ./.next
COPY public ./public
COPY node_modules ./node_modules
COPY package.json ./package.json

# Standalone server runs from .next/standalone/ but static files are excluded
# from the standalone trace. Copy them into the expected location.
RUN cp -r .next/static .next/standalone/.next/static

EXPOSE 3000
CMD ["node", ".next/standalone/server.js"]
