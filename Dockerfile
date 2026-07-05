# syntax=docker/dockerfile:1

# ---- Base -------------------------------------------------------------
# Node 22 (LTS) on Alpine. Next.js 16 requires Node >= 20.
FROM node:22-alpine AS base
# libc compat for any native deps that expect glibc symbols.
RUN apk add --no-cache libc6-compat

# ---- Dependencies -----------------------------------------------------
# Install with the lockfile only, so this layer is cached until
# package.json / package-lock.json actually change.
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Builder ----------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars are inlined into the client bundle at BUILD time,
# so they must be present here — not just at runtime. Railway exposes
# service variables to the Docker build automatically; declaring them as
# ARG lets Next.js read them during `next build`.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# Skip Next.js telemetry in CI/build.
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- Runner -----------------------------------------------------------
# Minimal production image: only the standalone server + static assets.
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Run as a non-root user.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# `public/` is optional in Next.js 16; copy it only if present so the
# build doesn't fail when the folder is absent.
COPY --from=builder /app/public ./public

# The standalone output already contains the traced node_modules and a
# self-contained server.js. Static chunks and public assets are copied
# in alongside it so server.js can serve them directly.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# Railway sets $PORT; server.js honours PORT + HOSTNAME env vars.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "server.js"]
