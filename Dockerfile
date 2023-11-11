FROM node:20-alpine AS builder

COPY . /app

WORKDIR /app

RUN npm i && npm run build

FROM node:20-alpine

COPY --from=builder /app /app

CMD ["/usr/local/bin/node", "/app/dist/index.js", "/app/config.json"]
