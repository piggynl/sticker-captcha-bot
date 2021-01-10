package bot

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/pkg/errors"
	"gopkg.in/tucnak/telebot.v2"

	"github.com/piggy-moe/sticker-captcha-bot/config"
	"github.com/piggy-moe/sticker-captcha-bot/log"
)

func EscapeHTML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}

var API *telebot.Bot

func Init() {
	var err error
	API, err = telebot.NewBot(telebot.Settings{
		Token: config.Config.Token,
	})
	if err != nil {
		log.Fatalf("bot.init: err %v", err)
	} else {
		log.Infof("bot.init: ok")
	}
}

func GetUpdates(offset int) ([]telebot.Update, error) {
	t := time.Now()
	params := map[string]string{
		"offset":          strconv.Itoa(offset),
		"timeout":         "50",
		"allowed_updates": `["message"]`,
	}

	data, err := API.Raw("getUpdates", params)
	if err != nil {
		log.Errorf("bot.getupdates(offset=%d)/request: err %v", offset, err)
		return nil, err
	}

	var resp struct {
		Result []telebot.Update
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		err = errors.Wrap(err, "telebot")
		log.Errorf("bot.getupdates(offset=%d)/decode: err %v", offset, err)
		return nil, err
	}
	d := time.Since(t).Round(time.Millisecond).String()
	log.Tracef("bot.getupdates(offset=%d): %s ok (%d vals...)", offset, d, len(resp.Result))
	return resp.Result, nil
}

func ParseCommand(m *telebot.Message) (cmd string, arg string) {
	var c string
	for _, e := range m.Entities {
		if e.Type == telebot.EntityCommand && e.Offset == 0 {
			c = m.Text[1:e.Length]
			break
		}
	}
	if len(c) == 0 {
		return "", ""
	}
	c = strings.ToLower(c)
	if strings.Contains(c, "@") {
		if strings.HasSuffix(c, "@"+strings.ToLower(API.Me.Username)) {
			c = c[:len(c)-(len(API.Me.Username)+1)]
		} else {
			return "", ""
		}
	}
	p := strings.Index(m.Text, " ")
	if p == -1 {
		return c, ""
	}
	return c, m.Text[p+1:]
}

func Send(cid int64, html string, reply int) int {
	t := time.Now()
	c := &telebot.Chat{ID: cid}
	m, err := API.Send(c, html, &telebot.SendOptions{
		ParseMode: telebot.ModeHTML,
		ReplyTo:   &telebot.Message{ID: reply},
	})
	d := time.Since(t).Round(time.Millisecond).String()
	if err != nil {
		log.Warnf("bot.send(cid=%d, html=(...), reply=%d): %s err %v", cid, reply, d, err)
		return 0
	}
	log.Tracef("bot.send(cid=%d, html=(...), reply=%d): %s ok %d", cid, reply, d, m.ID)
	return m.ID
}

func Delete(cid int64, mid int) {
	t := time.Now()
	err := API.Delete(&telebot.Message{
		Chat: &telebot.Chat{ID: cid},
		ID:   mid,
	})
	d := time.Since(t).Round(time.Millisecond).String()
	if err != nil {
		log.Warnf("bot.delete(cid=%d, mid=%d): %s err %v", cid, mid, d, err)
	} else {
		log.Tracef("bot.delete(cid=%d, mid=%d): %s ok", cid, mid, d)
	}
}

func Mute(cid int64, uid int) {
	t := time.Now()
	c := &telebot.Chat{ID: cid}
	err := API.Restrict(c, &telebot.ChatMember{
		User:   &telebot.User{ID: uid},
		Rights: telebot.NoRights(),
	})
	d := time.Since(t).Round(time.Millisecond).String()
	if err != nil {
		log.Warnf("bot.mute(cid=%d, uid=%d): %s err %v", cid, uid, d, err)
	} else {
		log.Tracef("bot.mute(cid=%d, uid=%d): %s ok", cid, uid, d)
	}
}

func Ban(cid int64, uid int) {
	t := time.Now()
	c := &telebot.Chat{ID: cid}
	err := API.Ban(c, &telebot.ChatMember{
		User: &telebot.User{ID: uid},
	})
	d := time.Since(t).Round(time.Millisecond).String()
	if err != nil {
		log.Warnf("bot.ban(cid=%d, uid=%d): %s err %v", cid, uid, d, err)
	} else {
		log.Tracef("bot.ban(cid=%d, uid=%d): %s ok", cid, uid, d)
	}
}

func Unban(cid int64, uid int) {
	t := time.Now()
	c := &telebot.Chat{ID: cid}
	err := API.Unban(c, &telebot.User{ID: uid})
	d := time.Since(t).Round(time.Millisecond).String()
	if err != nil {
		log.Warnf("bot.unban(cid=%d, uid=%d): %s err %v", cid, uid, d, err)
	} else {
		log.Tracef("bot.unban(cid=%d, uid=%d): %s ok", cid, uid, d)
	}
}

func GetChatMember(cid int64, uid int) *telebot.ChatMember {
	t := time.Now()
	c := &telebot.Chat{ID: cid}
	m, err := API.ChatMemberOf(c, &telebot.User{ID: uid})
	d := time.Since(t).Round(time.Millisecond).String()
	if err != nil {
		log.Tracef("bot.getchatmember(cid=%d, uid=%d): %s err %v", cid, uid, d, err)
	} else {
		log.Tracef("bot.getchatmember(cid=%d, uid=%d): %s ok (...)", cid, uid, d)
	}
	return m
}
