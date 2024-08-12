import "source-map-support/register.js";

import { Redis } from "ioredis";

import * as config from "./config.js";
import { logger } from "./log.js";

const redisLogger = logger.child({ scope: "redis" });

let client: Redis;

export async function init(): Promise<void> {
    client = new Redis(config.get("redis"));
    if (!await ping()) {
        process.exit(1);
    }
}

export async function ping(): Promise<boolean> {
    let r;
    try {
        r = await client.ping();
    } catch (err) {
        redisLogger.error("ping()", { ok: false, error: err });
        return false;
    }
    redisLogger.debug("ping()", { ok: true });
    return true;
}

export async function get(key: string): Promise<string | undefined> {
    let r: string | null;
    try {
        r = await client.get(key);
    } catch (err) {
        redisLogger.debug("get()", { key, ok: false, err });
        return undefined;
    }
    const val = r === null ? undefined : r;
    redisLogger.debug("get()", { key, ok: true, val });
    return val;
}

export async function set(key: string, val: string, ttl?: number): Promise<void> {
    try {
        if (ttl === undefined) {
            client.set(key, val);
        } else {
            client.set(key, val, "EX", ttl);
        }
    } catch (err) {
        redisLogger.debug("set()", { key, val, ttl, ok: false, err });
        return;
    }
    redisLogger.debug("set()", { key, val, ttl, ok: true });
}

export async function del(key: string): Promise<void> {
    let r;
    try {
        r = await client.del(key);
    } catch (err) {
        redisLogger.debug("del()", { key, ok: false, err });
        return;
    }
    redisLogger.debug("del()", { key, ok: true, deleted: r > 0 });
}

export async function exists(key: string): Promise<boolean> {
    let r;
    try {
        r = await client.exists(key);
    } catch (err) {
        redisLogger.debug("exists()", { key, ok: false, err });
        return false;
    }
    const exists = r > 0;
    redisLogger.debug("exists()", { key, ok: true, exists });
    return exists;
}
