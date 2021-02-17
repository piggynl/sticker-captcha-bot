import "source-map-support/register";

import util from "util";

import npmlog from "npmlog";
import redis from "redis";

import config from "./config";

function log(level: npmlog.LogLevels, msg: string, ...args: any[]): void {
    for (let i = 0; i < args.length; i++) {
        if (typeof args[i] == "string" && args[i].length > 50) {
            args[i] = "(...)";
        }
        if (args[i] instanceof Error) {
            args[i] = args[i].message;
        }
    }
    npmlog[level]("redis", msg, ...args);
}

let client: redis.RedisClient;

async function init(): Promise<void> {
    client = redis.createClient(config.get("redis"));
    if (!await ping()) {
        process.exit(1);
    }
}

async function ping(): Promise<boolean> {
    const ping = util.promisify(client.ping.bind(client)) as any;
    let r;
    try {
        r = await ping();
    } catch (e) {
        log("error", "ping(): err %s", e);
        return false;
    }
    log("silly", "ping(): ok");
    return true;
}

async function get(k: string): Promise<string | undefined> {
    const get = util.promisify(client.get.bind(client));
    let r: string | null;
    try {
        r = await get(k);
    } catch (e) {
        log("silly", "get(%s): err %s", k, e);
        return undefined;
    }
    const v = r === null ? undefined : r;
    log("silly", "get(%s): ok %j", k, v);
    return v;
}

async function set(k: string, v: string, ttl?: number): Promise<void> {
    const set = util.promisify(client.set.bind(client)) as any;
    try {
        if (ttl === undefined) {
            set(k, v);
        } else {
            set(k, v, "EX", ttl);
        }
    } catch (e) {
        log("silly", "set(%s, %j, ttl=%j): err %s", k, v, ttl, e);
        return;
    }
    log("silly", "set(%s, %j, ttl=%j): ok", k, v, ttl);
}

async function del(k: string): Promise<void> {
    const del = util.promisify(client.del.bind(client)) as any;
    let r;
    try {
        r = await del(k);
    } catch (e) {
        log("silly", "del(%s): err %s", k, e);
        return;
    }
    log("silly", "del(%s): ok %j", k, r > 0);
}

async function exists(k: string): Promise<boolean> {
    const exists = util.promisify(client.exists.bind(client)) as any;
    let r;
    try {
        r = await exists(k);
    } catch (e) {
        log("silly", "exists(%s): err %s", k, e);
        return false;
    }
    const v = r > 0;
    log("silly", "exists(%s): ok %j", k, v);
    return v;
}

export = {
    init,
    ping,
    get,
    set,
    del,
    exists,
};
