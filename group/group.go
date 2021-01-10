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

type role string

const (
	roleNone   role = "none"
	roleMember role = "member"
	roleAdmin  role = "admin"
)

type action string

const (
	actionKick action = "kick"
	actionMute action = "mute"
	actionBan  action = "ban"
)

var index sync.Map

func Get(id int64) *Group {
	n := New(id)
	g, loaded := index.LoadOrStore(id, n)
	if loaded {
		log.Tracef("group.get(%d): ok loaded", id)
		return g.(*Group)
	}
	log.Tracef("group.get(%d): ok stored", id)
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
	id      int64
	Updates chan *Update
}

func New(id int64) *Group {
	return &Group{
		id:      id,
		Updates: make(chan *Update, 100),
	}
}

func (g *Group) start() {
	for upd := range g.Updates {
		m := upd.msg
		if upd.failUser != nil && g.existsf("enabled") {
			if g.existsf("user:%d:pending", upd.failUser.ID) {
				g.onFail(upd.msg, upd.failUser)
			}
			continue
		}
		for _, u := range m.UsersJoined {
			g.delf("user:%d:role", u.ID)
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
	log.Tracef("group(%d).onjoin(mid=%d, uid=%d)", g.id, m.ID, u.ID)
	g.setf("user:%d:pending", "true", 0, u.ID)
	go func(g *Group, m *telebot.Message, u *telebot.User) {
		h := g.send(g.render(g.getOnJoinTemplate(), u), m.ID)
		time.Sleep(g.getTimeout())
		g.Updates <- &Update{
			msg:      m,
			failUser: u,
		}
		if g.existsf("verbose") {
			return
		}
		g.delete(h)
	}(g, m, u)
}

func (g *Group) onPass(m *telebot.Message, u *telebot.User) {
	log.Tracef("group(%d).onpass(mid=%d, uid=%d)", g.id, m.ID, u.ID)
	g.delf("user:%d:pending", u.ID)

	if g.existsf("quiet") {
		go g.delete(m.ID)
		return
	}
	go func(g *Group, m int) {
		h := g.send(g.render(g.getOnPassTemplate(), u), m)
		time.Sleep(g.getTimeout())
		if g.existsf("verbose") {
			return
		}
		go g.delete(m)
		go g.delete(h)
	}(g, m.ID)
}

func (g *Group) onFail(m *telebot.Message, u *telebot.User) {
	log.Tracef("group(%d).onfail(uid=%d)", g.id, u.ID)
	g.delf("user:%d:pending", u.ID)
	if !g.existsf("verbose") && m != nil {
		go g.delete(m.ID)
	}
	switch g.getFailAction() {
	case actionKick:
		go g.kick(u.ID)
	case actionMute:
		go g.mute(u.ID)
	case actionBan:
		go g.ban(u.ID)
	}

	if g.existsf("quiet") {
		return
	}
	go func(g *Group) {
		h := g.send(g.render(g.getOnFailTemplate(), u), 0)
		time.Sleep(g.getTimeout())
		if !g.existsf("verbose") {
			g.delete(h)
		}
	}(g)
}

func (g *Group) handleCommand(m *telebot.Message) {
	cmd, arg := bot.ParseCommand(m)
	switch cmd {

	case "ping":
		go g.send(g.format("ping.pong", time.Since(m.Time()).Round(time.Millisecond)), m.ID)

	case "help":

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
			a := action(arg)
			if a != actionKick && a != actionMute && a != actionBan {
				go g.send(g.format("cmd.bad_param")+"\n\n"+g.format("action.help.full"), m.ID)
				return
			}
			g.setf("action", arg, 0)
		}
		v := g.format("action." + string(g.getFailAction()))
		go g.send(g.format("action.query", v), m.ID)

	case "timeout":
		if !g.checkIsAdmin(m) {
			return
		}
		if len(arg) > 0 {
			x, err := strconv.Atoi(arg)
			if err != nil || x <= 0 || x >= 2147483648 {
				go g.send(g.format("cmd.bad_param")+"\n\n"+g.format("timeout.help.full"), m.ID)
				return
			}
			g.setf("timeout", arg, 0)
		}
		x := int(g.getTimeout().Seconds())
		s := g.format("timeout.query", x)
		if x < 10 {
			s += "\n\n" + g.format("timeout.notice")
		}
		go g.send(s, m.ID)

	case "lang":
		if !g.checkIsAdmin(m) {
			return
		}
		if len(arg) > 0 {
			g.setf("lang", arg, 0)
		}
		l, err := g.getf("lang")
		if err == redis.Nil {
			l = "en_US"
		}
		go g.send(g.format("lang.query", l, i18n.AllLanguages()), m.ID)

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

	case "onjoin":
		if !g.checkIsAdmin(m) {
			return
		}
		if len(arg) > 0 {
			g.setf("onjoin:template", arg, 0)
		}
		go g.send(g.format("onjoin.query", g.getOnJoinTemplate()), m.ID)

	case "onpass":
		if !g.checkIsAdmin(m) {
			return
		}
		if len(arg) > 0 {
			g.setf("onpass:template", arg, 0)
		}
		go g.send(g.format("onpass.query", g.getOnPassTemplate()), m.ID)

	case "onfail":
		if !g.checkIsAdmin(m) {
			return
		}
		if len(arg) > 0 {
			g.setf("onfail:template", arg, 0)
		}
		go g.send(g.format("onfail.query", g.getOnFailTemplate()), m.ID)

	case "refresh":
		u := m.Sender.ID
		if m.ReplyTo != nil {
			u = m.ReplyTo.Sender.ID
		}
		g.delf("user:%d:role", u)
		go g.delete(m.ID)

	case "reverify":
		if !g.checkIsAdmin(m) || !g.checkHasReply(m) || !g.checkNoOp(m) {
			return
		}
		if m.ReplyTo.IsService() {
			for _, u := range m.ReplyTo.UsersJoined {
				g.onJoin(m, &u)
			}
		} else {
			g.onJoin(m, m.ReplyTo.Sender)
		}

	case "pass":
		if !g.checkIsAdmin(m) || !g.checkHasReply(m) || !g.checkNoOp(m) {
			return
		}
		if m.ReplyTo.IsService() {
			for _, u := range m.ReplyTo.UsersJoined {
				g.onPass(m, &u)
			}
		} else {
			g.onPass(m, m.ReplyTo.Sender)
		}

	case "fail":
		if !g.checkIsAdmin(m) || !g.checkHasReply(m) || !g.checkNoOp(m) {
			return
		}
		if m.ReplyTo.IsService() {
			for _, u := range m.ReplyTo.UsersJoined {
				g.onFail(nil, &u)
			}
		} else {
			g.onFail(nil, m.ReplyTo.Sender)
		}

	}
}

func (g *Group) checkIsAdmin(m *telebot.Message) bool {
	if g.getRole(m.Sender.ID) == roleAdmin {
		return true
	}
	if g.existsf("quiet") {
		go g.delete(m.ID)
		return false
	}
	go func(g *Group, m int) {
		h := g.send(g.format("cmd.not_admin"), m)
		if g.existsf("verbose") {
			return
		}
		time.Sleep(g.getTimeout())
		go g.delete(m)
		go g.delete(h)
	}(g, m.ID)
	return false
}

func (g *Group) checkHasReply(m *telebot.Message) bool {
	if m.ReplyTo != nil {
		return true
	}
	if g.existsf("quiet") {
		go g.delete(m.ID)
		return false
	}
	go func(g *Group, m int) {
		h := g.send(g.format("cmd.need_reply"), m)
		if g.existsf("verbose") {
			return
		}
		time.Sleep(g.getTimeout())
		go g.delete(m)
		go g.delete(h)
	}(g, m.ID)
	return false
}

func (g *Group) checkNoOp(m *telebot.Message) bool {
	if g.existsf("enabled") {
		if m.ReplyTo.IsService() {
			if len(m.ReplyTo.UsersJoined) > 0 {
				return true
			}
		} else {
			return true
		}
	}
	if g.existsf("quiet") {
		go g.delete(m.ID)
		return false
	}
	go func(g *Group, m int) {
		h := g.send(g.format("cmd.no_op"), m)
		if g.existsf("verbose") {
			return
		}
		time.Sleep(g.getTimeout())
		go g.delete(m)
		go g.delete(h)
	}(g, m.ID)
	return false
}

func (g *Group) getRole(u int) role {
	ttl := 120 * time.Second
	r, err := g.getf("user:%d:role", u)
	if err == redis.Nil {
		e := bot.GetChatMember(g.id, u)
		switch {
		case e == nil:
			r = string(roleNone)
		case e.Role == telebot.Creator || e.CanRestrictMembers:
			r = string(roleAdmin)
		default:
			r = string(roleMember)
		}
		g.setf("user:%d:role", r, ttl, u)
	}
	return role(r)
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

func (g *Group) getFailAction() action {
	fallback := actionKick
	s, err := g.getf("action")
	if err == redis.Nil {
		return fallback
	}
	return action(s)
}

func (g *Group) getTimeout() time.Duration {
	fallback := 60 * time.Second
	s, err := g.getf("timeout")
	if err == redis.Nil {
		return fallback
	}
	x, _ := strconv.Atoi(s)
	return time.Duration(x) * time.Second
}

func (g *Group) getLang() string {
	fallback := "en_US"
	s, err := g.getf("lang")
	if err == redis.Nil {
		return fallback
	}
	return s
}

func (g *Group) getf(f string, args ...interface{}) (string, error) {
	k := fmt.Sprintf("group:%d:", g.id) + fmt.Sprintf(f, args...)
	return redis.Get(k)
}

func (g *Group) setf(f string, v string, ttl time.Duration, args ...interface{}) {
	k := fmt.Sprintf("group:%d:", g.id) + fmt.Sprintf(f, args...)
	redis.Set(k, v, ttl)
}

func (g *Group) delf(f string, args ...interface{}) {
	k := fmt.Sprintf("group:%d:", g.id) + fmt.Sprintf(f, args...)
	redis.Del(k)
}

func (g *Group) existsf(f string, args ...interface{}) bool {
	k := fmt.Sprintf("group:%d:", g.id) + fmt.Sprintf(f, args...)
	r, _ := redis.Exists(k)
	return r
}

func (g *Group) send(html string, reply int) int {
	return bot.Send(g.id, html, reply)
}

func (g *Group) delete(m int) {
	bot.Delete(g.id, m)
}

func (g *Group) mute(u int) {
	bot.Mute(g.id, u)
}

func (g *Group) ban(u int) {
	g.delf("user:%d:role", u)
	bot.Ban(g.id, u)
}

func (g *Group) unban(u int) {
	bot.Unban(g.id, u)
}

func (g *Group) kick(u int) {
	g.ban(u)
	g.unban(u)
}

func (g *Group) format(key string, args ...interface{}) string {
	return i18n.Format(g.getLang(), key, args...)
}
