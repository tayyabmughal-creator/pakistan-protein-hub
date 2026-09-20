# Pak Nutrition storefront.
#
# Three stages so the runtime image carries no build toolchain, no dev
# dependencies and no source: just the standalone server bundle Next produced.
#
# The build needs API_BASE_URL because pages are prerendered at build time —
# the homepage and category pages are generated against a live API. That means
# CI must be able to reach an API, and a build against an unreachable one fails
# loudly rather than emitting an empty catalogue.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` and not `npm install`: it installs exactly the lockfile, so a build
# six months from now resolves the same tree as the one that was tested.
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Server-side only; never inlined into client JS.
ARG API_BASE_URL=http://backend:8000
ENV API_BASE_URL=$API_BASE_URL

# These two ARE inlined into the client bundle at build time, so they must be
# correct for the target environment. A wrong NEXT_PUBLIC_SITE_URL means every
# canonical tag and sitemap entry points at the wrong host.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_MEDIA_HOST
ENV NEXT_PUBLIC_MEDIA_HOST=$NEXT_PUBLIC_MEDIA_HOST

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as a non-root user. If the process is ever compromised through a
# dependency, it should not own the filesystem it runs on.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

# The standalone output already contains a minimal node_modules and server.js.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# Hits a real page, not just the port. A Next process can be listening while
# failing to render, and a health check that only proves the socket is open
# would keep a broken container in the load balancer.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/robots.txt').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
