package main

import (
	"github.com/piggy-moe/sticker-captcha-bot/bot"
	"github.com/piggy-moe/sticker-captcha-bot/config"
	"github.com/piggy-moe/sticker-captcha-bot/group"
	"github.com/piggy-moe/sticker-captcha-bot/log"
	"github.com/piggy-moe/sticker-captcha-bot/redis"
)

func main() {
	log.Init()
	config.Init()
	redis.Init()
	bot.Init()

	lastUpdateID := -1
	for {
		updates, err := bot.GetUpdates(lastUpdateID + 1)
		if err != nil {
			return
		}

		for _, upd := range updates {
			lastUpdateID = upd.ID
			m := upd.Message
			g := group.Get(m.Chat.ID)
			g.Updates <- group.NewUpdate(&upd)
		}
	}
}
