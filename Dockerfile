FROM node:22-slim AS builder

COPY . /app

WORKDIR /app

RUN corepack enable && pnpm install && npm run build

FROM node:22-slim

COPY --from=builder /app /app

CMD ["/usr/local/bin/node", "/app/dist/index.js", "/app/config.json"]
