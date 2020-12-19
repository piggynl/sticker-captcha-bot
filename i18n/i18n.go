package i18n

import (
	"fmt"
	"strings"
)

var languages = make(map[string]map[string]string)

func HasLanguage(lang string) bool {
	_, ok := languages[lang]
	return ok
}

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
	}
	return fmt.Sprintf(s, args...)
}
