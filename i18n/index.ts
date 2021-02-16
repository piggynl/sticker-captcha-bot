import "source-map-support/register";

import util from "util";

import en_US from "./en_US";
import zh_CN from "./zh_CN";

const languages = new Map<string, Record<string, string>>();

languages.set("en_US", en_US);
languages.set("zh_CN", zh_CN);

function allLangs(): string {
    let res: string[] = [];
    for (const l of languages.keys()) {
        res.push(`<code>${l}</code>`);
    }
    return res.join(", ");
}

function format(lang: string, key: string, ...args: any[]): string {
    const n = languages.get("en_US") as Record<string, string>;
    const m = languages.get(lang) || n;
    const s = m[key] || n[key] || `{{key=${key}, args=%j}}`;
    return util.format(s, ...args);
}

export = {
    allLangs,
    format,
};
