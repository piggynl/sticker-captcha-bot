import "source-map-support/register";

import util from "util";

import * as config from "../config.js";

import en_US from "./en_US.js";
import zh_CN from "./zh_CN.js";
import zh_Peng from "./zh_Peng.js";

const languages = new Map<string, Record<string, string>>();

languages.set("en_US", en_US);
languages.set("zh_CN", zh_CN);
languages.set("zh_Peng", zh_Peng);

export function allLangs(): string {
    let res: string[] = [];
    for (const l of languages.keys()) {
        res.push(`<code>${l}</code>`);
    }
    return res.join(", ");
}

export function format(lang: string, key: string, ...args: any[]): string {
    const n = languages.get(config.get("default_lang", "en_US")) as Record<string, string>;
    const m = languages.get(lang) || n;
    const s = m[key] || n[key] || `{{key=${key}, args=%j}}`;
    return util.format(s, ...args);
}
