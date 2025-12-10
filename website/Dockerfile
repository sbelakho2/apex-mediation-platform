FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

FROM base AS deps
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package*.json ./
# Support monorepo scenarios where website/package-lock.json may not exist.
# If a lockfile exists, use npm ci for deterministic installs; otherwise fall back to npm install.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM base AS builder
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ARG NEXT_PUBLIC_CONSOLE_URL
ENV NEXT_PUBLIC_CONSOLE_URL=${NEXT_PUBLIC_CONSOLE_URL}
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ARG NEXT_IGNORE_TS_ERRORS
ENV NEXT_IGNORE_TS_ERRORS=${NEXT_IGNORE_TS_ERRORS}
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN addgroup -g 1001 nodejs && adduser -G nodejs -g nodejs -s /bin/sh -D nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/package.json ./package.json
USER nextjs
EXPOSE 3001
ENV PORT=3001
CMD ["node", "server.js"]
