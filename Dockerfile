FROM golang:alpine AS builder

COPY . /app

WORKDIR /app

RUN apk update && apk upgrade && go build -v

FROM alpine

COPY --from=builder /app/sticker-captcha-bot /app

CMD ["/app/sticker-captcha-bot", "/etc/sticker-captcha-bot/config.json"]
