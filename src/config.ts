import "source-map-support/register.js";

import fs from "node:fs/promises";

import { logger } from "./log.js";

let configLogger = logger.child({ scope: "config" });

let config: any;

export async function init(): Promise<void> {
    if (process.argv.length < 3) {
        logger.error(`Usage: ${process.argv0} ${process.argv[1]} <config>`);
        process.exit(1);
    }
    const filename = process.argv[2];
    try {
        const file = await fs.readFile(filename, "utf-8");
        config = JSON.parse(file);
    } catch (err) {
        configLogger.info("load", { filename, ok: false, err });
        process.exit(1);
    }
    logger.level = get("log_level", "silly");
    configLogger.info("load", { filename, ok: true });
}

export function get<T>(key: string, fallback?: T): T {
    return config[key] !== undefined ? config[key] : fallback;
}
