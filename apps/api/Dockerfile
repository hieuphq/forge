FROM oven/bun:1.3 AS build

WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

RUN bun install --frozen-lockfile --ignore-scripts
RUN bun run --filter @yourorg/api db:generate

FROM oven/bun:1.3-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/bun.lock /app/tsconfig.base.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages ./packages

WORKDIR /app/apps/api
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
