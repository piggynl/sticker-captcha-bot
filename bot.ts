import "source-map-support/register.js";

import TelegramBotAPI from "node-telegram-bot-api";

import { logger } from "./log.js";

import * as config from "./config.js";

const botLogger = logger.child({ scope: "bot" });

export function escapeHTML(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

let api: TelegramBotAPI;
let me: TelegramBotAPI.User;

export async function init(): Promise<void> {
    api = new TelegramBotAPI(config.get("token", ""), {
        request: {
            url: undefined as any as string,
            timeout: config.get("timeout"),
            proxy: config.get("proxy"),
        },
    });
    const begin = Date.now();
    try {
        me = await api.getMe();
    } catch (err) {
        const dur_ms = Date.now() - begin;
        botLogger.error("init()", { ok: false, dur_ms, err });
        process.exit(1);
    }
    const dur_ms = Date.now() - begin;
    const { username, first_name } = me
    botLogger.info("init()", { ok: true, dur_ms, username, first_name, me });
}

export function getAPI(): typeof api {
    return api;
}

export function getMe(): typeof me {
    return me;
}

export function parseCommand(m: TelegramBotAPI.Message): [cmd?: string, arg?: string] {
    const text = m.text;
    if (text === undefined) {
        return [];
    }
    let c: string | undefined;
    for (const err of (m.entities || [])) {
        if (err.type === "bot_command" && err.offset === 0) {
            c = text.slice(1, err.length);
        }
    }
    if (c === undefined) {
        return [];
    }
    c = c.toLowerCase();
    if (c.indexOf("@") !== -1) {
        if (c.endsWith("@" + me.username?.toLowerCase())) {
            c = c.slice(0, c.length - (me.username?.length as number + 1))
        } else {
            return [];
        }
    }
    const p = text.indexOf(" ");
    if (p === -1) {
        return [c];
    }
    return [c, text.slice(p + 1).trim()];
}

export async function send(chat: number, html: string, reply?: number): Promise<number> {
    const begin = Date.now();
    let m: TelegramBotAPI.Message;
    try {
        m = await api.sendMessage(chat, html, {
            disable_web_page_preview: true,
            parse_mode: "HTML",
            reply_to_message_id: reply,
        });
    } catch (err) {
        const dur_ms = Date.now() - begin;
        botLogger.warn("send()", { chat, html, reply, ok: false, dur_ms, err });
        return 0;
    }
    const dur_ms = Date.now() - begin;
    botLogger.verbose("send()", { chat, html, reply, ok: true, dur_ms, msg: m.message_id });
    return m.message_id;
}

export async function del(chat: number, msg: number): Promise<boolean> {
    const begin = Date.now();
    let deleted: boolean;
    try {
        deleted = await api.deleteMessage(chat, msg as any);
    } catch (err) {
        const dur_ms = Date.now() - begin;
        botLogger.warn("del()", { chat, msg, ok: false, dur_ms, err });
        return false;
    }
    const dur_ms = Date.now() - begin;
    botLogger.verbose("del()", { chat, msg, ok: true, dur_ms, deleted });
    return deleted;
}

export async function mute(chat: number, user: number): Promise<boolean> {
    const begin = Date.now();
    let muted: boolean;
    try {
        muted = await api.restrictChatMember(chat, user as any, {
            permissions: {
                can_send_messages: false
            }
        });
    } catch (err) {
        const dur_ms = Date.now() - begin;
        botLogger.warn("mute()", { chat, user, dur_ms, ok: false, err });
        return false;
    }
    const dur_ms = Date.now() - begin;
    botLogger.verbose("mute()", { chat, user, dur_ms, ok: true, muted });
    return muted;
}

export async function ban(chat: number, user: number): Promise<boolean> {
    const begin = Date.now();
    let banned: boolean;
    try {
        banned = await api.banChatMember(chat, user as any);
    } catch (err) {
        const dur_ms = Date.now() - begin;
        botLogger.warn("ban()", { chat, user, dur_ms, ok: false, err });
        return false;
    }
    const dur_ms = Date.now() - begin;
    botLogger.verbose("mute()", { chat, user, dur_ms, ok: true, banned });
    return banned;
}

export async function unban(chat: number, user: number): Promise<boolean> {
    const begin = Date.now();
    let unbanned: boolean;
    try {
        unbanned = await api.unbanChatMember(chat, user as any);
    } catch (err) {
        const dur_ms = Date.now() - begin;
        botLogger.warn("unban()", { chat, user, dur_ms, ok: false, err });
        return false;
    }
    const dur_ms = Date.now() - begin;
    botLogger.verbose("unban()", { chat, user, dur_ms, ok: true, unbanned });
    return unbanned;
}

export async function getChatMember(chat: number, user: number): Promise<TelegramBotAPI.ChatMember | undefined> {
    const begin = Date.now();
    let member: TelegramBotAPI.ChatMember;
    try {
        member = await api.getChatMember(chat, user as any);
    } catch (err: unknown) {
        const dur_ms = Date.now() - begin;
        botLogger.warn("getmember()", { chat, user, dur_ms, ok: false, err });
        if (typeof err === "object" && err !== null && "code" in err && err.code === "ETELEGRAM") {
            return undefined;
        } else {
            throw err;
        }
    }
    const dur_ms = Date.now() - begin;
    botLogger.verbose("getmember()", { chat, user, dur_ms, ok: true, member });
    return member;
}

export async function leaveChat(chat: number): Promise<boolean> {
    const begin = Date.now();
    let left: boolean;
    try {
        left = await api.leaveChat(chat);
    } catch (err) {
        const dur_ms = Date.now() - begin;
        botLogger.warn("leave()", { chat, dur_ms, ok: false, err });
        return false;
    }
    const dur_ms = Date.now() - begin;
    botLogger.verbose("leave()", { chat, dur_ms, ok: true, left });
    return left;
}
