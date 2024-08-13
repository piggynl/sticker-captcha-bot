import "source-map-support/register.js";

import { TranslationKey } from "./en_US.js";

export default {
    "action.ban": "封禁",
    "action.help": "/action [kick|mute|ban] - 查看或设置对验证失败用户的措施",
    "action.kick": "踢出",
    "action.mute": "禁言",
    "action.query": "当前对验证失败用户的措施是<b>%s</b>",
    "bot.angry": "ε٩(๑&gt; ₃ &lt;)۶з <b>有人抢走了我的管理员权限，我不开心了。</b>",
    "bot.not_admin": "操作失败，可能是群管并未赋予我<b>删除消息</b>和<b>封禁用户</b>权限。",
    "cmd.bad_param": "不合法的参数。",
    "cmd.need_reply": "使用此命令需要回复一条消息。",
    "cmd.not_admin": "诶？此命令仅限有<b>封禁用户</b>权限的管理员使用。",
    "cmd.not_in_group": "请在群组中使用此命令。",
    "debug.help": "/debug [on|off] - 切换调试模式（在日志中记录更多信息用于调试）",
    "debug.off": "调试模式<b>已关闭</b>.",
    "debug.on": "调试模式<b>已开启/b>.",
    "disable.help": "/disable - 在本群禁用此机器人",
    "enable.help": "/enable - 在本群启用此机器人",
    "fail.help": "/fail - 回复某用户的消息或者 Ta 的入群消息，强制使该待验证用户验证失败",
    "help.help": "/help - 查看此帮助信息",
    "lang.help": "/lang [string] - 查看或设置当前对话的显示语言",
    "lang.query": "当前语言是 <code>%s</code>\n\n所有可用的语言有：%s",
    "onfail.default": "$u 验证失败了。",
    "onfail.help": "/onfail [string] - 查看或设置对于验证失败用户发送消息的模板",
    "onfail.query": "当前对于验证失败用户发送消息的模板是：\n<pre>%s</pre>",
    "onjoin.default": "您好 $u，本群开启了验证功能，请在 $t 秒内发送任意一个 sticker 来完成验证。",
    "onjoin.help": "/onjoin [string] - 查看或设置向新入群用户发送消息的模板。<b>你应当在这条消息中告诉他们发送任意一个 sticker 来完成验证。</b>",
    "onjoin.query": "当前向新入群用户发送消息的模板是：\n<pre>%s</pre>",
    "onpass.default": "$u 验证成功了。",
    "onpass.help": "/onpass [string] - 查看或设置对于验证通过用户发送消息的模板",
    "onpass.query": "当前对于验证通过用户发送消息的模板是：\n<pre>%s</pre>",
    "open_source.help": "此项目开源于： https://github.com/piggynl/sticker-captcha-bot",
    "pass.help": "/pass - 回复某用户的消息或者 Ta 的入群消息，使该待验证用户跳过验证",
    "ping.help": "/ping - 我还活着吗？",
    "ping.pong": "Pong! | %s",
    "quiet.help": "/quiet [on|off] - 切换安静模式（使群组尽可能安静）",
    "quiet.off": "安静模式<b>已关闭</b>。",
    "quiet.on": "安静模式<b>已开启</b>。",
    "refresh.help": "/refresh - 更新自己或被回复用户的状态缓存",
    "reverify.help": "/reverify - 手动对被回复的成员发起一次验证",
    "status.disable": "此机器人在本群<b>已禁用</b>。",
    "status.enable": "此机器人在本群<b>已启用</b>。",
    "status.help": "/status - 查看此机器人是否已在本群启用",
    "sticker_captcha_bot.help": "<b>Sticker CAPTCHA Bot</b>",
    "template.help": "定制验证的提示模板需要了解一些变量：提及用户 =&gt; <code>$u</code>，仅通过 ID 提及用户 =&gt; <code>$i</code>，超时时间（秒）=&gt; <code>$t</code>，字符 <code>$</code> =&gt; <code>$$</code>。",
    "timeout.help": "/timeout [integer] - 查看或设置本群的验证超时时间",
    "timeout.query": "本群的超时时间是 <b>%d 秒</b>。",
    "timeout.notice": "<b>诶？这对于人类来说会不会有点短？</b>",
    "verbose.help": "/verbose [on|off] - 切换详细模式（保留所有消息）",
    "verbose.off": "详细模式<b>已关闭</b>。",
    "verbose.on": "详细模式<b>已开启</b>。",
} as Record<TranslationKey, string>;
