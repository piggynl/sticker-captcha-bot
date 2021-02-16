import "source-map-support/register";

import TelegramBot from "node-telegram-bot-api";
import npmlog from "npmlog";

import bot from "./bot";
import redis from "./redis";
import i18n from "./i18n";

type Role = "none" | "member" | "admin";

type Action = "kick" | "mute" | "ban";

class Group {

    private static index = new Map<number, Group>();

    public static get(id: number): Group {
        let g = Group.index.get(id);
        if (g !== undefined) {
            npmlog.silly("group", "get(%j): ok loaded", id);
            return g;
        }
        g = new Group(id);
        Group.index.set(id, g);
        npmlog.silly("group", "get(%j): ok stored", id);
        return g;
    }

    public readonly id: number;

    private readonly resolvers: Map<number, (m?: number) => void>;

    public constructor(id: number) {
        this.id = id;
        this.resolvers = new Map();
    }

    public async handleMessage(m: TelegramBot.Message): Promise<void> {
        npmlog.verbose("bot", "(update, chat=%j, msg=%j)", m.chat.id, m.message_id);
        for (const u of (m.new_chat_members || [])) {
            await this.delKey(`user:${u.id}:role`);
            if (u.id === bot.getMe().id) {
                await this.delKey("enabled");
            }
        }
        if (await this.handleVerification(m)) {
            return;
        }
        if (await this.handleCommand(m)) {
            return;
        }
    }

    private async handleVerification(m: TelegramBot.Message): Promise<boolean> {
        if (await this.existsKey(`user:${m.from?.id}:pending`)) {
            if (m.sticker !== undefined) {
                await this.onPass(m, m.from as TelegramBot.User);
            } else {
                await this.delMsg(m.message_id);
            }
            return true;
        }
        if (!await this.existsKey("enabled")) {
            return false;
        }
        if (await this.getRole(bot.getMe().id) !== "admin") {
            await this.delKey("enabled");
            await this.send(await this.format("bot.angry"));
            await this.leave();
            return true;
        }
        if (m.new_chat_members !== undefined) {
            await Promise.all(m.new_chat_members.map((u) => this.onJoin(m, u)));
            return true;
        }
        return false;
    }

    private async onJoin(msg: TelegramBot.Message, user: TelegramBot.User): Promise<void> {
        npmlog.info("group", "(group=%j).onjoin(msg=%j, user=%j)", this.id, msg.message_id, user.id);
        await this.setKey(`user:${user.id}:pending`, "true");
        const h = await this.send(await this.render(await this.getTemplate("onjoin"), user), msg.message_id);

        let sessionResolver: ((m?: number) => void) | undefined;
        const m = await Promise.race([
            this.sleep(),
            new Promise<number | undefined>(async (resolve) => {
                const resolver = (m?: number): void => {
                    this.resolvers.delete(user.id);
                    resolve(m);
                };
                sessionResolver = resolver;
                this.resolvers.set(user.id, resolver);
                if (user.id === bot.getMe().id) {
                    try {
                        const w = await bot.getAPI().sendSticker(this.id, "CAACAgUAAxkBAAEI_IFgKqYpeH28bSvB_qd3ybC5vS-RxwACsgADVl_YH824--1Q953HHgQ");
                        await this.onPass(w, w.from as TelegramBot.User);
                    } catch {}
                }
            }),
        ]);
        if (!await this.existsKey("verbose")) {
            await this.delMsg(h);
        }

        if (typeof m === "number") {
            if (await this.existsKey("quiet")) {
                await this.delMsg(m);
                return;
            }
            const g = await this.send(await this.render(await this.getTemplate("onpass"), user), m);
            if (await this.existsKey("verbose")) {
                return;
            }
            await this.sleep();
            await Promise.all([
                this.delMsg(h),
                this.delMsg(g),
            ]);
            return;
        }

        if (!await this.existsKey("verbose")) {
            await this.delMsg(msg.message_id);
        }
        if (this.resolvers.get(user.id) !== sessionResolver) {
            npmlog.info("group", "(group=%j).ondiscard(user=%j)", this.id, user.id);
            this.resolvers.delete(user.id);
            return;
        }

        npmlog.info("group", "(group=%j).onfail(user=%j)", this.id, user.id);
        this.resolvers.delete(user.id);
        await this.delKey(`user:${user.id}:pending`);
        await this[await this.getAction()](user.id);
        if (await this.existsKey("quiet")) {
            return;
        }
        const f = await this.send(await this.render(await this.getTemplate("onfail"), user));
        if (await this.existsKey("verbose")) {
            return;
        }
        await this.sleep();
        await this.delMsg(f);
    }

    private async onPass(msg: TelegramBot.Message, user: TelegramBot.User): Promise<void> {
        npmlog.info("group", "(group=%j).onpass(msg=%j, user=%j)", this.id, msg.message_id, user.id);
        await this.delKey(`user:${user.id}:pending`);
        const resolve = this.resolvers.get(user.id);
        if (resolve === undefined) {
            return;
        }
        resolve(msg.message_id);
    }

    private async handleCommand(m: TelegramBot.Message): Promise<boolean> {
        const [cmd, arg] = bot.parseCommand(m);
        switch (cmd) {

            case "start":
            case "help":
                const help = [
                    "sticker_captcha_bot.help",
                    "",
                    "help.help",
                    "ping.help",
                    "refresh.help",
                    "",
                    "status.help",
                    "enable.help",
                    "disable.help",
                    "",
                    "lang.help",
                    "timeout.help",
                    "action.help",
                    "",
                    "onjoin.help",
                    "onpass.help",
                    "onfail.help",
                    "template.help",
                    "",
                    "verbose.help",
                    "quiet.help",
                    "",
                    "reverify.help",
                    "pass.help",
                    "fail.help",
                    "",
                    "open_source.help",
                ];
                await this.send((await Promise.all(help.map((l: string): Promise<string> => {
                    if (l.length === 0) {
                        return Promise.resolve("");
                    }
                    return this.format(l);
                }))).join("\n"), m.message_id);
                break;

            case "ping":
                const l = (Math.ceil(Date.now() / 1e3) - m.date).toString() + "s";
                await this.send(await this.format("ping.pong", l), m.message_id);
                break;

            case "refresh":
                let u = m.from?.id;
                if (m.reply_to_message !== undefined) {
                    u = m.reply_to_message.from?.id;
                }
                if (u !== undefined) {
                    await this.delKey(`user:${u}:role`);
                }
                await this.delMsg(m.message_id);
                break;

            case "status":
                if (!await this.checkFromAdmin(m)) {
                    break;
                }
                if (await this.existsKey("enabled")) {
                    await this.send(await this.format("status.enable"), m.message_id);
                } else {
                    await this.send(await this.format("status.disable"), m.message_id);
                }
                break;

            case "enable":
            case "disable":
                if (!await this.checkFromAdmin(m)) {
                    break;
                }
                if (cmd === "enable") {
                    if (await this.getRole(bot.getMe().id, true) !== "admin") {
                        await this.send(await this.format("bot.not_admin"), m.message_id);
                        break;
                    }
                    await this.setKey("enabled", "true");
                } else {
                    await this.delKey("enabled");
                }
                await this.send(await this.format(`status.${cmd}`), m.message_id);
                break;

            case "lang":
                if (!await this.checkFromAdmin(m, true)) {
                    break;
                }
                if (arg !== undefined) {
                    await this.setKey("lang", arg);
                }
                await this.send(await this.format("lang.query", await this.getLang(), i18n.allLangs()), m.message_id);
                break;

            case "action":
                if (!await this.checkFromAdmin(m)) {
                    break;
                }
                if (arg !== undefined) {
                    if (!["kick", "mute", "ban"].includes(arg)) {
                        await this.send(await this.format("cmd.bad_param"), m.message_id);
                        break;
                    }
                    await this.setKey("action", arg);
                }
                const v = await this.format("action." + await this.getAction());
                await this.send(await this.format("action.query", v), m.message_id);
                break;

            case "timeout":
                if (!await this.checkFromAdmin(m)) {
                    break;
                }
                if (arg !== undefined) {
                    const x = Number.parseInt(arg);
                    if (Number.isNaN(x) || x <= 0 || x >= 2147483648) {
                        await this.send(await this.format("cmd.bad_param"), m.message_id);
                        break;
                    }
                    await this.setKey("timeout", arg);
                }
                const x = await this.getTimeout();
                let s = await this.format("timeout.query", x);
                if (x < 10) {
                    s += "\n\n" + await this.format("timeout.notice");
                }
                await this.send(s, m.message_id);
                break;

            case "onjoin":
            case "onpass":
            case "onfail":
                if (!await this.checkFromAdmin(m)) {
                    break;
                }
                if (arg !== undefined) {
                    await this.setKey(`${cmd}:template`, arg);
                }
                await this.send(await this.format(`${cmd}.query`, await this.getTemplate(cmd)), m.message_id)
                break;

            case "verbose":
            case "quiet":
                if (!await this.checkFromAdmin(m)) {
                    break;
                }
                const conflict = cmd === "verbose" ? "quiet" : "verbose";
                switch (arg) {
                    case "on":
                        await this.setKey(cmd, "true");
                        await this.delKey(conflict);
                        await this.send(await this.format(`${cmd}.${arg}`), m.message_id);
                        break;
                    case "off":
                        await this.delKey(cmd);
                        await this.send(await this.format(`${cmd}.off`), m.message_id);
                        break;
                    case undefined:
                        if (await this.existsKey(cmd)) {
                            await this.send(await this.format(`${cmd}.on`), m.message_id);
                        } else {
                            await this.send(await this.format(`${cmd}.off`), m.message_id);
                        }
                        break;
                    default:
                        await this.send(await this.format("cmd.bad_param"), m.message_id);
                }
                break;

            case "reverify":
                if (!await this.checkFromAdmin(m) || !await this.checkHasReply(m)) {
                    break;
                }
                const repJoin = m.reply_to_message as TelegramBot.Message;
                if (repJoin.new_chat_members !== undefined) {
                    await Promise.all(repJoin.new_chat_members.map((u) => this.onJoin(repJoin, u)));
                } else {
                    await this.onJoin(repJoin, repJoin.from as TelegramBot.User);
                }
                break;

            case "pass":
                if (!await this.checkFromAdmin(m) || !await this.checkHasReply(m)) {
                    break;
                }
                const repPass = m.reply_to_message as TelegramBot.Message;
                if (repPass.new_chat_members !== undefined) {
                    await Promise.all(repPass.new_chat_members.map((u) => this.onPass(m, u)));
                } else {
                    await this.onPass(m, repPass.from as TelegramBot.User);
                }
                break;

            case "fail":
                if (!await this.checkFromAdmin(m) || !await this.checkHasReply(m)) {
                    break;
                }
                const repFail = m.reply_to_message as TelegramBot.Message;
                if (repFail.new_chat_members !== undefined) {
                    for (const u of repFail.new_chat_members) {
                        const resolve = this.resolvers.get(u.id);
                        if (resolve !== undefined) {
                            resolve(undefined);
                        }
                    }
                } else {
                    const resolve = this.resolvers.get(m.reply_to_message?.from?.id as number);
                    if (resolve !== undefined) {
                        resolve(undefined);
                    }
                }
                break;

            case "id":
                await this.send(`<code>${this.id}</code>`, m.message_id);
                break;

            default:
                return false;
        }

        return true;
    }

    private async checkFromAdmin(m: TelegramBot.Message, allowPrivate?: boolean): Promise<boolean> {
        if (m.chat.type === "private") {
            if (allowPrivate) {
                return true;
            }
            await this.send(await this.format("cmd.not_in_group"), m.message_id);
            return false
        }
        if (await this.getRole(m.from?.id as number) !== "admin") {
            await this.send(await this.format("cmd.not_admin"), m.message_id);
            return false;
        }
        return true;
    }

    private async checkHasReply(m: TelegramBot.Message): Promise<boolean> {
        if (m.reply_to_message !== undefined) {
            return true;
        }
        await this.send(await this.format("cmd.need_reply"), m.message_id);
        return false;
    }

    private async sleep(): Promise<void> {
        const time = await this.getTimeout() * 1e3;
        return new Promise((resolve) => setTimeout(resolve, time));
    }

    private async getRole(user: number, refresh: boolean = false): Promise<Role> {
        let r: string | undefined;
        if (!refresh) {
            r = await this.getKey(`user:${user}:role`);
            if (r !== undefined) {
                // TODO: type check
                return r as Role;
            }
        }
        const e = await bot.getChatMember(this.id, user);
        switch (true) {
            case e === undefined:
                r = "none";
                break;
            case e?.status === "creator" || e?.can_restrict_members:
                r = "admin";
                break;
            default:
                r = "member";
                break;
        }
        await this.setKey(`user:${user}:role`, r, 120);
        return r as Role;
    }

    private async render(tmpl: string, user: TelegramBot.User): Promise<string> {
        tmpl = bot.escapeHTML(tmpl);
        let res = "";
        for (let i = 0; i < tmpl.length; i++) {
            if (tmpl[i] !== "$") {
                res += tmpl[i];
                continue;
            }
            i++;
            switch (tmpl[i]) {
                case "$":
                    res += "$";
                    break;
                case "u":
                    let n = user.first_name;
                    if (user.last_name !== undefined) {
                        n = `${n} ${user.last_name}`;
                    }
                    res += `<a href="tg://user?id=${user.id}">${bot.escapeHTML(n)}</a>`;
                    break;
                case "i":
                    res += `<a href="tg://user?id=${user.id}">${user.id}</a>`;
                    break;
                case "t":
                    res += (await this.getTimeout()).toString();
                    break;
                default:
                    // no-op;
            }
        }
        return res;
    }

    private async getTemplate(on: "onjoin" | "onpass" | "onfail"): Promise<string> {
        const s = await this.getKey(`${on}:template`);
        if (s === undefined) {
            return this.format(`${on}.default`);
        }
        return s;
    }

    private async getAction(): Promise<Action> {
        const s = await this.getKey("action");
        if (s === undefined) {
            return "kick";
        }
        // TODO: type check
        return s as Action;
    }

    private async getTimeout(): Promise<number> {
        const s = await this.getKey("timeout");
        const t = Number.parseInt(s as string);
        if (Number.isNaN(t)) {
            return 60;
        }
        return t;
    }

    private async getLang(): Promise<string> {
        const s = await this.getKey("lang");
        if (s === undefined) {
            return "en_US";
        }
        return s;
    }

    private async getKey(key: string): Promise<string | undefined> {
        const k = `group:${this.id}:${key}`;
        return redis.get(k);
    }

    private async setKey(key: string, val: string, ttl?: number): Promise<void> {
        const k = `group:${this.id}:${key}`;
        return redis.set(k, val, ttl);
    }

    private async delKey(key: string): Promise<void> {
        const k = `group:${this.id}:${key}`;
        return redis.del(k);
    }

    private async existsKey(key: string): Promise<boolean> {
        const k = `group:${this.id}:${key}`;
        return redis.exists(k);
    }

    private async send(html: string, reply?: number): Promise<number> {
        return bot.send(this.id, html, reply);
    }

    private async delMsg(msg: number): Promise<boolean> {
        return bot.del(this.id, msg);
    }

    private async mute(user: number): Promise<boolean> {
        return bot.mute(this.id, user);
    }

    private async ban(user: number): Promise<void> {
        await bot.ban(this.id, user);
        await this.delKey(`user:${user}:role`);
    }

    private async kick(user: number): Promise<void> {
        await bot.ban(this.id, user);
        await this.delKey(`user:${user}:role`);
        await bot.unban(this.id, user);
    }

    private async leave(): Promise<boolean> {
        return bot.leaveChat(this.id);
    }

    private async format(key: string, ...args: any[]): Promise<string> {
        return i18n.format(await this.getLang(), key, ...args);
    }

};

export = Group;
