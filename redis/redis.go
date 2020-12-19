package redis

import (
	"context"
	"time"

	"github.com/go-redis/redis/v8"

	"github.com/piggy-moe/sticker-captcha-bot/log"
)

var bg = context.Background()

var Nil = redis.Nil

var Client *redis.Client

func Init() {
	Client = redis.NewClient(&redis.Options{})
	Ping()
}

func Ping() (string, error) {
	res, err := Client.Ping(bg).Result()
	if err != nil {
		log.Warnf("redis.ping: err %v", err)
	} else {
		log.Tracef("redis.ping: ok %s", res)
	}
	return res, err
}

func Get(k string) (string, error) {
	res, err := Client.Get(bg, k).Result()
	if err != nil {
		if err != redis.Nil {
			log.Warnf("redis.get(key=%q): err %v", k, err)
		} else {
			log.Tracef("redis.get(key=%q): ok %v", k, err)
		}
	} else {
		log.Tracef("redis.get(key=%q): ok %q", k, res)
	}
	return res, err
}

func Set(k string, v string, ttl time.Duration) (string, error) {
	res, err := Client.Set(bg, k, v, ttl).Result()
	if err != nil {
		log.Warnf("redis.set(key=%q, val=%q, ttl=%s): err %v", k, v, ttl, err)
	} else {
		log.Tracef("redis.set(key=%q, val=%q, ttl=%s): ok %s", k, v, ttl, res)
	}
	return res, err
}

func Del(k string) (bool, error) {
	count, err := Client.Del(bg, k).Result()
	res := count == 1
	if err != nil {
		log.Warnf("redis.del(key=%q): err %v", k, err)
	} else {
		log.Tracef("redis.del(key=%q): ok %t", k, res)
	}
	return res, err
}

func Exists(k string) (bool, error) {
	count, err := Client.Exists(bg, k).Result()
	res := count == 1
	if err != nil {
		log.Warnf("redis.exists(key=%q): err %v", k, err)
	} else {
		log.Tracef("redis.exists(key=%q): ok %t", k, res)
	}
	return res, err
}
