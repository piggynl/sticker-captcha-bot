package i18n

import (
	"fmt"
	"strings"

	"github.com/piggy-moe/sticker-captcha-bot/log"
)

var languages = make(map[string]map[string]string)

func AllLanguages() string {
	r := make([]string, 0, len(languages)-1)
	for l := range languages {
		if len(l) > 0 {
			r = append(r, fmt.Sprintf("<code>%s</code>", l))
		}
	}
	return strings.Join(r, ", ")
}

func Format(lang string, key string, args ...interface{}) string {
	m, ok := languages[lang]
	if !ok {
		m = languages["en_US"]
	}
	s := m[key]
	if len(s) == 0 {
		s = languages["en_US"][key]
	}
	if len(s) == 0 {
		s = fmt.Sprintf("{{%s}}", key)
		log.Warnf("i18n.Format(lang=%q, key=%q, args...=(%d vals...)/format: key not found", lang, key, len(args))
	}
	return fmt.Sprintf(s, args...)
}
