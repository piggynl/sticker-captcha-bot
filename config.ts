import "source-map-support/register";

import fs from "node:fs/promises";

import npmlog from "npmlog";

let config: any;

export async function init(): Promise<void> {
    if (process.argv.length < 3) {
        npmlog.error("sticker-captcha-bot", `Usage: %j <config>`, process.argv[1]);
        process.exit(1);
    }
    const filename = process.argv[2];
    try {
        const file = await fs.readFile(filename, "utf-8");
        config = JSON.parse(file);
    } catch (e: any) {
        npmlog.info("config", "load(%j): err %s", filename, e.message);
        process.exit(1);
    }
    npmlog.level = get("log_level", "silly");
    npmlog.info("config", "load(%j): ok", filename);
}

export function get<T>(key: string, fallback?: T): T {
    return config[key] !== undefined ? config[key] : fallback;
}
