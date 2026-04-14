# ---- Production Runner (pre-built on host) ----
FROM node:22-slim

# Install only the RUNTIME libraries needed by canvas
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    libpixman-1-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

# Copy the pre-built application
COPY .next ./.next
COPY public ./public
COPY node_modules ./node_modules
COPY package.json ./package.json

EXPOSE 3000
CMD ["npm", "start"]
