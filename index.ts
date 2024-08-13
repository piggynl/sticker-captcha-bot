import "source-map-support/register.js";

import * as bot from "./bot.js";
import * as config from "./config.js";
import Group from "./group.js";
import * as redis from "./redis.js";
import { logger } from "./log.js";
import TelegramBot from "node-telegram-bot-api";

Error.stackTraceLimit = Infinity;

const botLogger = logger.child({ scope: "bot" });

async function sleep(time: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, time));
}

(async () => {
    await config.init();
    await sleep(config.get("init_after", 0));
    await redis.init();
    await bot.init();

    let last_update_id = -1;
    while (true) {
        const offset = last_update_id + 1;
        let updates: TelegramBot.Update[];
        try {
            updates = await bot.getAPI().getUpdates({
                allowed_updates: ["message"],
                offset,
                timeout: 50,
            });
        } catch (err) {
            botLogger.info("getupdates()", { offset, ok: false, err });
            continue;
        }
        if (updates.length > 0) {
            last_update_id = updates[updates.length - 1].update_id;
        }
        botLogger.info("getupdates()", { offset, ok: true, last_update_id: last_update_id });

        for (const upd of updates) {
            const m = upd.message!;
            const g = Group.get(m.chat.id);
            g.pushMessage(m);
        }
    }
})();
