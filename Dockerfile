# syntax=docker/dockerfile:1.6

# ---------- deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
# Only the manifests, so the install layer is cached while source changes.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Dokploy sets a dummy value for build-time envs; the real ones come at runtime.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Default upload dir inside the container; mount a persistent volume here.
ENV UPLOAD_DIR=/data/uploads

# Non-root user — Next recommends uid 1001.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs \
 && mkdir -p /data/uploads \
 && chown -R nextjs:nodejs /data

# Standalone server + static assets + public files.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static     ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public           ./public
# Bootstrap artifacts the Dokploy "Postgres init" step runs once by hand.
COPY --from=build --chown=nextjs:nodejs /app/scripts          ./scripts

USER nextjs
EXPOSE 3000

# server.js is Next.js's standalone entrypoint.
CMD ["node", "server.js"]
