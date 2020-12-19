package group

import (
	"fmt"
	"regexp"
	"strconv"
	"sync"
	"time"

	"gopkg.in/tucnak/telebot.v2"

	"github.com/piggy-moe/sticker-captcha-bot/bot"
	"github.com/piggy-moe/sticker-captcha-bot/i18n"
	"github.com/piggy-moe/sticker-captcha-bot/log"
	"github.com/piggy-moe/sticker-captcha-bot/redis"
)

var index sync.Map

func Get(id int64) *Group {
	n := New(id)
	g, loaded := index.LoadOrStore(id, n)
	if loaded {
		log.Tracef("group.get(id=%d): ok loaded", id)
		return g.(*Group)
	}
	log.Tracef("group.get(id=%d): ok stored", id)
	go n.start()
	return n
}

type Update struct {
	msg      *telebot.Message
	failUser *telebot.User
}

func NewUpdate(upd *telebot.Update) *Update {
	return &Update{msg: upd.Message}
}

type Group struct {
	ID      int64
	Updates chan *Update
}

func New(id int64) *Group {
	return &Group{
		ID:      id,
		Updates: make(chan *Update, 1),
	}
}

func (g *Group) start() {
	for upd := range g.Updates {
		m := upd.msg
		if upd.failUser != nil {
			if g.existsf("user:%d:pending", upd.failUser.ID) {
				g.onFail(upd.failUser)
			}
			continue
		}
		if g.tryHandleVerification(m) {
			continue
		}
		g.handleCommand(m)
	}
}

func (g *Group) tryHandleVerification(m *telebot.Message) bool {
	if !g.existsf("enabled") {
		return false
	}
	if m.IsService() {
		for _, u := range m.UsersJoined {
			g.onJoin(m, &u)
		}
		return true
	}
	if g.existsf("user:%d:pending", m.Sender.ID) {
		if m.Sticker != nil {
			g.onPass(m, m.Sender)
		} else {
			g.delete(m.ID)
		}
		return true
	}
	return false
}

func (g *Group) onJoin(m *telebot.Message, u *telebot.User) {
	log.Tracef("group(id=%d).onjoin(messageid=%d, userid=%d)", g.ID, m.ID, u.ID)
	h := g.send(g.render(g.getOnJoinTemplate(), u), m.ID)
	g.setf("user:%d:pending", "true", 0, u.ID)
	go func(g *Group, u *telebot.User, m, h int) {
		time.Sleep(g.getTimeout())
		g.Updates <- &Update{failUser: u}
		if g.existsf("quiet") {
			go g.delete(m)
		}
		if !g.existsf("verbose") {
			go g.delete(h)
		}
	}(g, u, m.ID, h)
}

func (g *Group) onPass(m *telebot.Message, u *telebot.User) {
	log.Tracef("group(id=%d).onpass(messageid=%d, userid=%d)", g.ID, m.ID, u.ID)
	g.delf("user:%d:pending", u.ID)
	go func(g *Group, m int) {
		h := g.send(g.render(g.getOnPassTemplate(), u), m)
		time.Sleep(g.getTimeout())
		if g.existsf("quiet") {
			go g.delete(m)
		}
		if !g.existsf("verbose") {
			go g.delete(h)
		}
	}(g, m.ID)
}

func (g *Group) onFail(u *telebot.User) {
	log.Tracef("group(id=%d).onfail(userid=%d)", g.ID, u.ID)
	switch g.getFailAction() {
	case "mute":
		g.mute(u.ID)
	case "kick":
		g.kick(u.ID)
	case "ban":
		g.ban(u.ID)
	}
	g.delf("user:%d:pending", u.ID)
	go func(g *Group) {
		h := g.send(g.render(g.getOnFailTemplate(), u), 0)
		time.Sleep(g.getTimeout())
		if !g.existsf("verbose") {
			go g.delete(h)
		}
	}(g)
}

func (g *Group) handleCommand(m *telebot.Message) {
	cmd, arg := bot.ParseCommand(m)
	switch cmd {

	case "ping":
		g.send(g.format("ping.pong", time.Since(m.Time()).Round(time.Millisecond)), m.ID)

	case "status":
		if !g.checkIsAdmin(m) {
			return
		}
		if g.existsf("enabled") {
			go g.send(g.format("status.enable"), m.ID)
		} else {
			go g.send(g.format("status.disable"), m.ID)
		}

	case "enable":
		if !g.checkIsAdmin(m) {
			return
		}
		g.setf("enabled", "true", 0)
		go g.send(g.format("status.enable"), m.ID)

	case "disable":
		if !g.checkIsAdmin(m) {
			return
		}
		g.delf("enabled")
		go g.send(g.format("status.disable"), m.ID)

	case "action":
		if !g.checkIsAdmin(m) {
			return
		}
		if len(arg) > 0 {
			if arg != "mute" && arg != "kick" && arg != "ban" {
				go g.send(g.format("cmd.bad_param")+"\n\n"+g.format("action.help.full"), m.ID)
				return
			}
			g.setf("action", arg, 0)
		}
		v := g.format("action." + g.getFailAction())
		go g.send(g.format("action.query", v), m.ID)

	case "timeout":
		if !g.checkIsAdmin(m) {
			return
		}
		if len(arg) > 0 {
			x, err := strconv.Atoi(arg)
			if err != nil || x <= 0 {
				go g.send(g.format("cmd.bad_param")+"\n\n"+g.format("timeout.help.full"), m.ID)
				return
			}
			g.setf("timeout", arg, 0)
		}
		x := int(g.getTimeout().Seconds())
		s := g.format("timeout.query", x)
		if x < 10 {
			s += "\n\n" + g.format("timeout.warning")
		}
		go g.send(s, m.ID)

	case "lang":
		if !g.checkIsAdmin(m) {
			return
		}
		if len(arg) > 0 {
			if !i18n.HasLanguage(arg) {
				h := g.format("lang.help.full", i18n.AllLanguages())
				go g.send(g.format("cmd.bad_param")+"\n\n"+h, m.ID)
				return
			}
			g.setf("lang", arg, 0)
		}
		l, err := g.getf("lang")
		if err == redis.Nil {
			l = "en_US"
		}
		go g.send(g.format("lang.query", l), m.ID)

	case "verbose":
		if !g.checkIsAdmin(m) {
			return
		}
		if len(arg) > 0 {
			switch arg {
			case "on":
				g.setf("verbose", "true", 0)
				g.delf("quiet")
			case "off":
				g.delf("verbose")
			default:
				go g.send(g.format("cmd.bad_param")+"\n\n"+g.format("verbose.help.full"), m.ID)
				return
			}
		}
		if g.existsf("verbose") {
			go g.send(g.format("verbose.on"), m.ID)
		} else {
			go g.send(g.format("verbose.off"), m.ID)
		}

	case "quiet":
		if !g.checkIsAdmin(m) {
			return
		}
		if len(arg) > 0 {
			switch arg {
			case "on":
				g.setf("quiet", "true", 0)
				g.delf("verbose")
			case "off":
				g.delf("quiet")
			default:
				go g.send(g.format("cmd.bad_param")+"\n\n"+g.format("quiet.help.full"), m.ID)
				return
			}
		}
		if g.existsf("quiet") {
			go g.send(g.format("quiet.on"), m.ID)
		} else {
			go g.send(g.format("quiet.off"), m.ID)
		}

	case "onjoin_tmpl":
		if !g.checkIsAdmin(m) {
			return
		}
		if len(arg) > 0 {
			g.setf("onjoin:template", arg, 0)
		}
		go g.send(g.format("onjoin.query", g.getOnJoinTemplate()), m.ID)

	case "onpass_tmpl":
		if !g.checkIsAdmin(m) {
			return
		}
		if len(arg) > 0 {
			g.setf("onpass:template", arg, 0)
		}
		go g.send(g.format("onpass.query", g.getOnPassTemplate()), m.ID)

	case "onfail_tmpl":
		if !g.checkIsAdmin(m) {
			return
		}
		if len(arg) > 0 {
			g.setf("onfail:template", arg, 0)
		}
		go g.send(g.format("onfail.query", g.getOnFailTemplate()), m.ID)

	case "refresh_user":
		if m.ReplyTo == nil {
			go g.send(g.format("cmd.need_reply"), m.ID)
			return
		}
		g.delf("user:%d:is_admin", m.ReplyTo.Sender.ID)
		g.delf("user:%d:in_group", m.ReplyTo.Sender.ID)
		g.delete(m.ID)

	case "retest":
		if !g.checkIsAdmin(m) {
			return
		}
		if m.ReplyTo == nil {
			go g.send(g.format("cmd.need_reply"), m.ID)
			return
		}
		g.onJoin(m, m.ReplyTo.Sender)

	case "pass":
		if !g.checkIsAdmin(m) {
			return
		}
		if m.ReplyTo == nil {
			go g.send(g.format("cmd.need_reply"), m.ID)
			return
		}
		for _, u := range m.ReplyTo.UsersJoined {
			g.onPass(m, &u)
		}

	case "fail":
		if !g.checkIsAdmin(m) {
			return
		}
		if m.ReplyTo == nil {
			go g.send(g.format("cmd.need_reply"), m.ID)
			return
		}
		for _, u := range m.ReplyTo.UsersJoined {
			g.onFail(&u)
		}

	}
}

func (g *Group) checkIsAdmin(m *telebot.Message) bool {
	r, err := g.getf("user:%d:is_admin", m.Sender.ID)
	if err == redis.Nil {
		e := bot.GetChatMember(g.ID, m.Sender.ID)
		if e == nil {
			return false
		}
		r = strconv.FormatBool(e.Role == telebot.Creator || e.CanRestrictMembers)
		g.setf("user:%d:is_admin", r, 2*time.Minute, m.Sender.ID)
	}
	if r == "true" {
		return true
	}
	g.send(g.format("cmd.not_admin"), m.ID)
	return false
}

func (g *Group) isAdmin(u int) bool {
	r, err := g.getf("user:%d:is_admin", u)
	if err == redis.Nil {
		e := bot.GetChatMember(g.ID, u)
		if e == nil {
			return false
		}
		r = strconv.FormatBool(e.Role == telebot.Creator || e.CanRestrictMembers)
		g.setf("user:%d:is_admin", r, 2*time.Minute, u)
	}
	return r == "true"
}

func (g *Group) isInGroup(u int) bool {
	r, err := g.getf("user:%d:in_group", u)
	if err == redis.Nil {
		e := bot.GetChatMember(g.ID, u)
		f := e.Role == telebot.Creator ||
			e.Role == telebot.Administrator ||
			e.Role == telebot.Member
		r = strconv.FormatBool(f)
		g.setf("user:%d:in_group", r, 2*time.Minute, u)
	}
	return r == "true"
}

var templateRe = regexp.MustCompile("\\$.")

func (g *Group) render(template string, u *telebot.User) string {
	template = bot.EscapeHTML(template)
	return templateRe.ReplaceAllStringFunc(template, func(s string) string {
		switch s[1] {
		case '$':
			return "$"
		case 'u':
			n := u.FirstName
			if len(u.LastName) > 0 {
				n = n + " " + u.LastName
			}
			return fmt.Sprintf(`<a href="tg://user?id=%d">%s</a>`, u.ID, bot.EscapeHTML(n))
		case 't':
			return strconv.Itoa(int(g.getTimeout().Seconds()))
		default:
			return ""
		}
	})
}

func (g *Group) getOnJoinTemplate() string {
	fallback := g.format("onjoin.default")
	s, err := g.getf("onjoin:template")
	if err == redis.Nil {
		return fallback
	}
	return s
}

func (g *Group) getOnPassTemplate() string {
	fallback := g.format("onpass.default")
	s, err := g.getf("onpass:template")
	if err == redis.Nil {
		return fallback
	}
	return s
}

func (g *Group) getOnFailTemplate() string {
	fallback := g.format("onfail.default")
	s, err := g.getf("onfail:template")
	if err == redis.Nil {
		return fallback
	}
	return s
}

func (g *Group) getFailAction() string {
	fallback := "kick"
	s, err := g.getf("action")
	if err == redis.Nil {
		return fallback
	}
	if s != "mute" && s != "kick" && s != "ban" {
		g.delf("action")
		log.Errorf("group(id=%d).getfailaction/parse: err", g.ID)
		s = fallback
	}
	return s
}

func (g *Group) getTimeout() time.Duration {
	fallback := 60 * time.Second
	s, err := g.getf("timeout")
	if err == redis.Nil {
		return fallback
	}
	x, err := strconv.Atoi(s)
	if err != nil {
		g.delf("timeout")
		log.Errorf("group(id=%d).gettimeout/strconv: err %s", g.ID, err)
		return fallback
	}
	return time.Duration(x) * time.Second
}

func (g *Group) getLang() string {
	fallback := "en_US"
	s, err := g.getf("lang")
	if err == redis.Nil {
		return fallback
	}
	if !i18n.HasLanguage(s) {
		g.delf("lang")
		log.Errorf("group(id=%d).getlang/parse: err", g.ID)
		return fallback
	}
	return s
}

func (g *Group) getf(f string, args ...interface{}) (string, error) {
	k := fmt.Sprintf("group:%d:", g.ID) + fmt.Sprintf(f, args...)
	return redis.Get(k)
}

func (g *Group) setf(f string, v string, ttl time.Duration, args ...interface{}) {
	k := fmt.Sprintf("group:%d:", g.ID) + fmt.Sprintf(f, args...)
	redis.Set(k, v, ttl)
}

func (g *Group) delf(f string, args ...interface{}) {
	k := fmt.Sprintf("group:%d:", g.ID) + fmt.Sprintf(f, args...)
	redis.Del(k)
}

func (g *Group) existsf(f string, args ...interface{}) bool {
	k := fmt.Sprintf("group:%d:", g.ID) + fmt.Sprintf(f, args...)
	r, _ := redis.Exists(k)
	return r
}

func (g *Group) send(html string, reply int) int {
	return bot.Send(g.ID, html, reply)
}

func (g *Group) delete(m int) {
	bot.Delete(g.ID, m)
}

func (g *Group) mute(u int) {
	bot.Mute(g.ID, u)
}

func (g *Group) ban(u int) {
	bot.Ban(g.ID, u)
}

func (g *Group) unban(u int) {
	bot.Unban(g.ID, u)
}

func (g *Group) kick(u int) {
	g.ban(u)
	g.unban(u)
}

func (g *Group) format(key string, args ...interface{}) string {
	return i18n.Format(g.getLang(), key, args...)
}
