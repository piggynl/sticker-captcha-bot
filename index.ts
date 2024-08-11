import "source-map-support/register.js";

import npmlog from "npmlog";

import * as bot from "./bot.js";
import * as config from "./config.js";
import Group from "./group.js";
import * as redis from "./redis.js";

Error.stackTraceLimit = Infinity;

npmlog.stream = process.stdout;
npmlog.enableColor();

async function sleep(time: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, time));
}

(async () => {
    await config.init();
    await sleep(config.get("init_after", 0));
    await redis.init();
    await bot.init();

    let lastUpdateID = -1;
    while (true) {
        try {
            const updates = await bot.getAPI().getUpdates({
                allowed_updates: ["message"],
                offset: lastUpdateID + 1,
                timeout: 50,
            });

            for (const upd of updates) {
                lastUpdateID = upd.update_id;
                const m = upd.message;
                const g = Group.get(m?.chat.id as number);
                g.handleMessage(m as any).catch(() => undefined);
            }
        } catch {}
    }
})();
