import "source-map-support/register.js";

import TelegramBot from "node-telegram-bot-api";

import * as bot from "./bot.js";
import * as config from "./config.js";
import * as i18n from "./i18n/index.js";
import Mutex from "./mutex.js";
import * as redis from "./redis.js";
import { logger } from "./log.js";

const botLogger = logger.child({ scope: "bot" });
const groupLogger = logger.child({ scope: "group" });

type Role = "none" | "member" | "admin";

type Action = "kick" | "mute" | "ban";

export default class Group {

    private static index = new Map<number, Group>();

    public static get(id: number): Group {
        let g = Group.index.get(id);
        if (g !== undefined) {
            groupLogger.silly("get()", { chat: id, status: "loaded" });
            return g;
        }
        g = new Group(id);
        Group.index.set(id, g);
        groupLogger.silly("get()", { chat: id, status: "stored" });
        return g;
    }

    public readonly id: number;

    private readonly resolvers: Map<number, (passed: boolean) => void>;

    private readonly mutex: Mutex;

    public constructor(id: number) {
        this.id = id;
        this.resolvers = new Map();
        this.mutex = new Mutex();
    }

    public async handleMessage(m: TelegramBot.Message): Promise<void> {
        botLogger.verbose("update", { chat: m.chat.id, msg: m.message_id });
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
        if (await this.existsKey(`user:${user.id}:pending`)) {
            groupLogger.info("onjoin", { chat: this.id, msg: msg.message_id, user: user.id, status: "dup" });
            return;
        }

        groupLogger.info("onjoin", { chat: this.id, msg: msg.message_id, user: user.id, status: "start" });
        await this.setKey(`user:${user.id}:pending`, "true");
        const h = await this.send(await this.render(await this.getTemplate("onjoin"), user), msg.message_id);

        const passed = await Promise.race([
            this.sleep(false),
            new Promise<boolean>(async (resolve) => {
                const resolver = (passed: boolean): void => {
                    this.resolvers.delete(user.id);
                    resolve(passed);
                };
                this.resolvers.set(user.id, resolver);
                if (user.id === bot.getMe().id) {
                    try {
                        const s = "CAACAgUAAxkBAAEI_IFgKqYpeH28bSvB_qd3ybC5vS-RxwACsgADVl_YH824--1Q953HHgQ";
                        const w = await bot.getAPI().sendSticker(this.id, s);
                        await this.onPass(w, w.from as TelegramBot.User);
                    } catch { }
                }
            }),
        ]);

        if (!await this.existsKey("verbose")) {
            await this.delMsg(h);
        }
        if (passed) {
            return;
        }

        if (!await this.existsKey("verbose")) {
            await this.delMsg(msg.message_id);
        }
        await this.onFail(user);
    }

    private async onPass(msg: TelegramBot.Message, user: TelegramBot.User): Promise<void> {
        if (!await this.existsKey(`user:${user.id}:pending`)) {
            return;
        }
        groupLogger.info("onpass", { chat: this.id, msg: msg.message_id, user: user.id });
        await this.delKey(`user:${user.id}:pending`);
        const resolve = this.resolvers.get(user.id);
        if (resolve !== undefined) {
            resolve(true);
        }
        if (await this.existsKey("quiet")) {
            await this.delMsg(msg.message_id);
            return;
        }
        await this.send(await this.render(await this.getTemplate("onpass"), user), msg.message_id);
    }

    private async onFail(user: TelegramBot.User): Promise<void> {
        if (!await this.existsKey(`user:${user.id}:pending`)) {
            return;
        }
        groupLogger.info("onpass", { chat: this.id, user: user.id });
        await this.delKey(`user:${user.id}:pending`);
        const resolve = this.resolvers.get(user.id);
        if (resolve !== undefined) {
            resolve(false);
        }
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

    private async handleCommand(m: TelegramBot.Message): Promise<boolean> {
        const [cmd, arg] = bot.parseCommand(m);
        switch (cmd) {
            case "start":
            case "help":
                if (!await this.checkFromAdmin(m, true)) {
                    break;
                }
                const help: ("" | i18n.TranslationKey)[] = [
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
                const lang = await this.getLang()
                await this.send(help.map((l: "" | i18n.TranslationKey): string => {
                    return l === "" ? "" : i18n.format(lang, l);
                }).join("\n"), m.message_id);
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
                const status = await this.existsKey("enabled") ? "enable" : "disable";
                await this.send(await this.format(`status.${status}`), m.message_id);
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
                const v = await this.format(`action.${await this.getAction()}`);
                await this.send(await this.format("action.query", v), m.message_id);
                break;

            case "timeout":
                if (!await this.checkFromAdmin(m)) {
                    break;
                }
                if (arg !== undefined) {
                    const x = Number.parseInt(arg);
                    if (Number.isNaN(x) || x <= 0 || x >= 2147483.648) {
                        await this.send(await this.format("cmd.bad_param"), m.message_id);
                        break;
                    }
                    await this.setKey("timeout", x.toString());
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
            case "debug":
                if (!await this.checkFromAdmin(m)) {
                    break;
                }
                switch (arg) {
                    case "on":
                        await this.setKey(cmd, "true");
                        const conflict = {
                            "verbose": "quiet",
                            "quiet": "verbose",
                            "debug": undefined,
                        }[cmd];
                        if (conflict !== undefined) {
                            await this.delKey(conflict);
                        }
                        await this.send(await this.format(`${cmd}.on`), m.message_id);
                        break;
                    case "off":
                        await this.delKey(cmd);
                        await this.send(await this.format(`${cmd}.off`), m.message_id);
                        break;
                    case undefined:
                        const status = await this.existsKey(cmd) ? "on" : "off";
                        await this.send(await this.format(`${cmd}.${status}`), m.message_id);
                        break;
                    default:
                        await this.send(await this.format("cmd.bad_param"), m.message_id);
                }
                break;

            case "reverify":
            case "pass":
            case "fail":
                if (!await this.checkFromAdmin(m) || !await this.checkHasReply(m)) {
                    break;
                }
                const rep = m.reply_to_message as TelegramBot.Message;
                const func = {
                    reverify: (u: TelegramBot.User) => this.onJoin(rep, u),
                    pass: (u: TelegramBot.User) => this.onPass(m, u),
                    fail: (u: TelegramBot.User) => this.onFail(u),
                }[cmd];
                if (rep.new_chat_members !== undefined) {
                    await Promise.all(rep.new_chat_members.map((u) => func(u)));
                } else {
                    await func(rep.from as TelegramBot.User);
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

    private async sleep(): Promise<void>;
    private async sleep<T>(res: T): Promise<T>;
    private async sleep(res?: any): Promise<any> {
        const time = await this.getTimeout() * 1e3;
        return new Promise((resolve) => setTimeout(() => resolve(res), time));
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
        let e;
        while (true) {
            try {
                e = await bot.getChatMember(this.id, user, await this.existsKey("debug"));
                break;
            } catch { }
        }
        if (e === undefined || e.status === "kicked" || e.status == "left") {
            r = "none";
        } else if (e.status === "creator" || e.can_restrict_members) {
            r = "admin";
        } else {
            r = "member";
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
        return s !== undefined ? s : this.format(`${on}.default`);
    }

    private async getAction(): Promise<Action> {
        const s = await this.getKey("action");
        if (s === undefined) {
            return config.get("default_action", "kick");
        }
        // TODO: type check
        return s as Action;
    }

    private async getTimeout(): Promise<number> {
        const s = await this.getKey("timeout");
        const t = Number.parseInt(s as string);
        return Number.isNaN(t) ? config.get("default_timeout", 60) : t;
    }

    private async getLang(): Promise<string> {
        return await this.getKey("lang") || config.get("default_lang", "en_US");
    }

    private async getKey(key: string): Promise<string | undefined> {
        return redis.get(`group:${this.id}:${key}`);
    }

    private async setKey(key: string, val: string, ttl?: number): Promise<void> {
        return redis.set(`group:${this.id}:${key}`, val, ttl);
    }

    private async delKey(key: string): Promise<void> {
        return redis.del(`group:${this.id}:${key}`);
    }

    private async existsKey(key: string): Promise<boolean> {
        return redis.exists(`group:${this.id}:${key}`);
    }

    private async send(html: string, reply?: number): Promise<number> {
        return bot.send(this.id, html, await this.existsKey("debug"), reply);
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

    private async format(key: i18n.TranslationKey, ...args: any[]): Promise<string> {
        return i18n.format(await this.getLang(), key, ...args);
    }

};
