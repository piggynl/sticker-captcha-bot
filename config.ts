import "source-map-support/register";

import fs from "fs/promises";

import npmlog from "npmlog";

let config: any;

async function init(): Promise<void> {
    if (process.argv.length < 3) {
        npmlog.error("sticker-captcha-bot", `Usage: %j <config>`, process.argv[1]);
        process.exit(1);
    }
    const filename = process.argv[2];
    try {
        const file = await fs.readFile(filename, "utf-8");
        config = JSON.parse(file);
    } catch (e) {
        npmlog.info("config", "load(%j): err %s", e.message);
        process.exit(1);
    }
    npmlog.info("config", "load(%j): ok", filename);
}

function get(key: string): any {
    return config[key];
}

export = {
    init,
    get,
};
