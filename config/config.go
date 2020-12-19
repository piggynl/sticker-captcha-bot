package config

import (
	"encoding/json"
	"os"

	"github.com/piggy-moe/sticker-captcha-bot/log"
)

type Type struct {
	Token string `json:"token"`
}

var Config Type

func Init() {
	if len(os.Args) < 2 {
		log.Fatalf("Usage: %s <config>", os.Args[0])
	}
	filename := os.Args[1]
	file, err := os.Open(filename)
	if err != nil {
		log.Fatalf("config.init(filename=%q)/open: err %v", filename, err)
	}

	err = json.NewDecoder(file).Decode(&Config)
	if err != nil {
		log.Fatalf("config.load(filename=%q)/decode: err %v", filename, err)
	}

	log.Infof("config.load(filename=%q): ok", filename)
}
