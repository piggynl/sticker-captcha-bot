import "source-map-support/register";

import npmlog from "npmlog";

import bot from "./bot";
import config from "./config";
import Group from "./group";
import redis from "./redis";

Error.stackTraceLimit = Infinity;

npmlog.level = "silly";

(async () => {
    await config.init();
    await redis.init();
    await bot.init();

    let lastUpdateID = -1;
    while (true) {
        const updates = await bot.getAPI().getUpdates({
            allowed_updates: ["message"],
            offset: lastUpdateID + 1,
            timeout: 50,
        });

        for (const upd of updates) {
            lastUpdateID = upd.update_id;
            const m = upd.message;
            const g = Group.get(m?.chat.id as number);
            g.handleMessage(m as any);
        }
    }
})();
