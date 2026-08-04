# ── Multi-stage Node.js Dockerfile for EpochBridge ──

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist

# Copy static assets
COPY .env.example ./.env

# Create data and logs directories
RUN mkdir -p /app/data /app/logs

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Run as non-root user
USER node

# Start the application
CMD ["node", "dist/index.js"]
