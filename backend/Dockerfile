# ServiceHub Backend — Multi-stage Dockerfile
# ─────────────────────────────────────────────
# Stage 1: development  → hot reload with nodemon, source mounted as volume
# Stage 2: production   → minimal image, no devDeps, runs compiled/started node
#
# Local dev:
#   docker build --target development -t servicehub-backend:dev .
#   docker run -p 3000:3000 --env-file .env servicehub-backend:dev
#
# Production:
#   docker build --target production -t servicehub-backend:prod .

# ── Base (shared Node version) ─────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

# ── Development stage ──────────────────────────────────────────────────────
FROM base AS development
# Install ALL deps (including devDependencies like nodemon)
RUN npm ci
COPY . .
EXPOSE 3000
# Use nodemon for hot reload in development
CMD ["node_modules/.bin/nodemon", "src/server.js"]

# ── Production build stage ─────────────────────────────────────────────────
FROM base AS production-deps
# Install only production dependencies
RUN npm ci --only=production

FROM node:20-alpine AS production
WORKDIR /app

# Security: run as non-root user
RUN addgroup -S servicehub && adduser -S servicehub -G servicehub

# Copy only production deps and source
COPY --from=production-deps /app/node_modules ./node_modules
COPY . .

# Remove dev files from production image
RUN rm -f .env.example && rm -rf src/scripts

# Switch to non-root user
USER servicehub

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "src/server.js"]
