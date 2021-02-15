import "source-map-support/register";

import TelegramBotAPI from "node-telegram-bot-api";

import npmlog from "npmlog";

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
    npmlog[level]("bot", msg, ...args);
}

function escapeHTML(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

let api: TelegramBotAPI;
let me: TelegramBotAPI.User;

async function init(): Promise<void> {
    api = new TelegramBotAPI(config.get("token"),{
        request: {
            url: undefined as any as string,
            timeout: 20e3,
            proxy: config.get("proxy"),
        },
    });
    try {
        me = await api.getMe();
    } catch (e) {
        log("error", "init(): err %s", e);
        process.exit(1);
    }
    log("info", "init(): ok @%s", me.username);
}

function getAPI(): typeof api {
    return api;
}

function getMe(): typeof me {
    return me;
}

function parseCommand(m: TelegramBotAPI.Message): [cmd?: string, arg?: string] {
    const text = m.text;
    if (text === undefined) {
        return [];
    }
    let c: string | undefined;
    for (const e of (m.entities || [])) {
        if (e.type === "bot_command" && e.offset === 0) {
            c = text.slice(1, e.length);
        }
    }
    if (c === undefined) {
        return [];
    }
    c = c.toLowerCase();
    if (c.indexOf("@") !== -1) {
        if (c.endsWith("@" + me.username)) {
            c = c.slice(0, c.length - (me.username?.length as number + 1))
        } else {
            return [];
        }
    }
    const p = text.indexOf(" ");
    if (p === -1) {
        return [c]
    }
    return [c, text.slice(p + 1)]
}

async function send(chat: number, html: string, reply?: number): Promise<number> {
    const t = Date.now();
    let m: TelegramBotAPI.Message;
    try {
        m = await api.sendMessage(chat, html, {
            parse_mode: "HTML",
            reply_to_message_id: reply,
        });
    } catch (e) {
        const d = (Date.now() - t).toString() + "ms";
        log("warn", "send(chat=%j, html=(...), reply=%j): %s err %s", chat, reply, d, e);
        return 0;
    }
    const d = (Date.now() - t).toString() + "ms";
    log("silly", "send(chat=%j, html=(...), reply=%j): %s ok %j", chat, reply, d, m.message_id);
    return m.message_id;
}

async function del(chat: number, msg: number): Promise<boolean> {
    const t = Date.now();
    let r: boolean;
    try {
        r = await api.deleteMessage(chat, msg as any);
    } catch (e) {
        const d = (Date.now() - t).toString() + "ms";
        log("warn", "del(chat=%j, msg=%j): %s err %s", chat, msg, d, e);
        return false;
    }
    const d = (Date.now() - t).toString() + "ms";
    log("silly", "del(chat=%j, msg=%j): %s ok %j", chat, msg, d, r);
    return r;
}

async function mute(chat: number, user: number): Promise<boolean> {
    const t = Date.now();
    let r: boolean;
    try {
        r = await api.restrictChatMember(chat, user as any, {
            can_send_messages: false,
        });
    } catch (e) {
        const d = (Date.now() - t).toString() + "ms";
        log("warn", "mute(chat=%j, user=%j): %s err %s", chat, user, d, e);
        return false;
    }
    const d = (Date.now() - t).toString() + "ms";
    log("silly", "mute(chat=%j, user=%j): %s ok %j", chat, user, d, r);
    return r;
}

async function ban(chat: number, user: number): Promise<boolean> {
    const t = Date.now();
    let r: boolean;
    try {
        r = await api.kickChatMember(chat, user as any);
    } catch (e) {
        const d = (Date.now() - t).toString() + "ms";
        log("warn", "ban(chat=%j, user=%j): %s err %s", chat, user, d, e);
        return false;
    }
    const d = (Date.now() - t).toString() + "ms";
    log("silly", "ban(chat=%j, user=%j): %s ok %j", chat, user, d, r);
    return r;
}

async function unban(chat: number, user: number): Promise<boolean> {
    const t = Date.now();
    let r: boolean;
    try {
        r = await api.unbanChatMember(chat, user as any);
    } catch (e) {
        const d = (Date.now() - t).toString() + "ms";
        log("warn", "unban(chat=%j, user=%j): %s err %s", chat, user, d, e);
        return false;
    }
    const d = (Date.now() - t).toString() + "ms";
    log("silly", "unban(chat=%j, user=%j): %s ok %j", chat, user, d, r);
    return r;
}


async function getChatMember(chat: number, user: number): Promise<TelegramBotAPI.ChatMember | undefined> {
    const t = Date.now();
    let r: TelegramBotAPI.ChatMember;
    try {
        r = await api.getChatMember(chat, user as any);
    } catch (e) {
        const d = (Date.now() - t).toString() + "ms";
        log("warn", "getchatmember(chat=%j, user=%j): %s err %s", chat, user, d, e);
        return undefined;
    }
    const d = (Date.now() - t).toString() + "ms";
    log("silly", "getchatmember(chat=%j, user=%j): %s ok (...)", chat, user, d);
    return r;
}

export = {
    escapeHTML,
    init,
    getAPI,
    getMe,
    parseCommand,
    send,
    del,
    mute,
    ban,
    unban,
    getChatMember,
}
