FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY package.json bun.lock* ./

RUN bun install --frozen-lockfile

COPY . .

RUN bun run build

FROM oven/bun:1-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 bun

COPY --from=builder --chown=bun:nodejs /app/dist ./dist
COPY --from=builder --chown=bun:nodejs /app/package.json .

USER bun

EXPOSE 4321

# Run with: docker run -e GITHUB_TOKEN=your_token_here <image>
CMD ["bun", "run", "dist/server/entry.mjs"]
