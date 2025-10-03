FROM node:20-alpine AS base
RUN apk add --no-cache ffmpeg libc6-compat bash

# Install dependencies only when needed
FROM base AS deps
RUN yarn global add pnpm

WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json pnpm-lock.yaml* source.config.ts ./
RUN pnpm i --frozen-lockfile

# Rebuild the source code only when needed
FROM deps AS builder

WORKDIR /app

# Install dependencies based on the preferred package manager
COPY . .
RUN pnpm build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir .next && \
    chown nextjs:nodejs .next

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/start.sh ./start.sh

USER nextjs

EXPOSE 3000

ENV NODE_ENV production

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Ensure entrypoint scripts are executable
RUN chmod +x ./start.sh ./scripts/queue-worker.mjs

# server.js is created by next build from the standalone output
CMD ["./start.sh"]
