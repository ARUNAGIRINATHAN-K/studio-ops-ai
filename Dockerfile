# Production Dockerfile for StudioOps AI
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install all dependencies (including devDependencies required for Vite build)
RUN npm ci

# Copy project source files
COPY . .

# Build Vite frontend assets
RUN npm run build

# Production runtime image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Copy dependency manifests and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy application files and built static dist output
COPY --from=builder /app/server ./server
COPY --from=builder /app/dist ./public

# Create data directory for persistent task and agent storage
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

VOLUME ["/app/data"]

CMD ["node", "server/server.js"]
