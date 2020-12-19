package bot

import (
	"encoding/json"
	"strconv"
	"strings"

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
	log.Tracef("bot.getupdates(offset=%d): ok (%d vals...)", offset, len(resp.Result))
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

func Send(chatid int64, html string, reply int) int {
	c := &telebot.Chat{ID: chatid}
	m, err := API.Send(c, html, &telebot.SendOptions{
		ParseMode: telebot.ModeHTML,
		ReplyTo:   &telebot.Message{ID: reply},
	})
	if err != nil {
		log.Warnf("bot.send(chatid=%d, html=(...), reply=%d): err %v", chatid, reply, err)
		return 0
	}
	log.Tracef("bot.send(chatid=%d, html=(...), reply=%d): ok %d", chatid, reply, m.ID)
	return m.ID
}

func Delete(chatid int64, messageid int) {
	err := API.Delete(&telebot.Message{
		Chat: &telebot.Chat{ID: chatid},
		ID:   messageid,
	})
	if err != nil {
		log.Warnf("bot.delete(chatid=%d, messageid=%d): err %v", chatid, messageid, err)
	} else {
		log.Tracef("bot.delete(chatid=%d, messageid=%d): ok", chatid, messageid)
	}
}

func Mute(chatid int64, userid int) {
	c := &telebot.Chat{ID: chatid}
	err := API.Restrict(c, &telebot.ChatMember{
		User:   &telebot.User{ID: userid},
		Rights: telebot.NoRights(),
	})
	if err != nil {
		log.Warnf("bot.mute(chatid=%d, userid=%d): err %v", chatid, userid, err)
	} else {
		log.Tracef("bot.mute(chatid=%d, userid=%d): ok", chatid, userid)
	}
}

func Ban(chatid int64, userid int) {
	c := &telebot.Chat{ID: chatid}
	err := API.Ban(c, &telebot.ChatMember{
		User: &telebot.User{ID: userid},
	})
	if err != nil {
		log.Warnf("bot.ban(chatid=%d, userid=%d): err %v", chatid, userid, err)
	} else {
		log.Tracef("bot.ban(chatid=%d, userid=%d): ok", chatid, userid)
	}
}

func Unban(chatid int64, userid int) {
	c := &telebot.Chat{ID: chatid}
	err := API.Unban(c, &telebot.User{ID: userid})
	if err != nil {
		log.Warnf("bot.unban(chatid=%d, userid=%d): err %v", chatid, userid, err)
	} else {
		log.Tracef("bot.unban(chatid=%d, userid=%d): ok", chatid, userid)
	}
}

func GetChatMember(chatid int64, userid int) *telebot.ChatMember {
	c := &telebot.Chat{ID: chatid}
	m, err := API.ChatMemberOf(c, &telebot.User{ID: userid})
	if err != nil {
		log.Warnf("bot.getchatmember(chatid=%d, userid=%d): err %v", chatid, userid, err)
	} else {
		log.Tracef("bot.getchatmember(chatid=%d, userid=%d): ok (...)", chatid, userid)
	}
	return m
}
