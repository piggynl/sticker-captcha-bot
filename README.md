# Sticker CAPTCHA Bot

> A simple Telegram bot which requires users to send any sticker after joining the group.

The bot instance is running as [@sticker_captcha_bot](https://t.me/sticker_captcha_bot).

---

Help message of the bot:

**Sticker CAPTCHA Bot**

> `/help` - view this help message
>
> `/ping` - am I alive?
>
> `/refresh` - refresh the status of yourself or replied user

> `/status` - view whether the bot has been enabled in this group
>
> `/enable` - enable the bot in this group
>
> `/disable` - disable the bot in this group

> `/lang [string]` - get or set the display language in this group
>
> `/timeout [integer]` - get or set the timeout in this group
>
> `/action [kick|mute|ban]` - get or set the action for users who failed the verification

> `/onjoin [string]` - get or set the template of messages sent to new users to the group. **You should tell them to send a sticker in this message.**
>
> `/onpass [string]` - get or set the template of messages sent to users who have passed verification.
>
> `/onfail [string]` - get or set the template of messages sent to users who have failed verification.
>
> In a template, use `$$` for a single `$`, `$u` for a mention to the user, `$t` for the seconds of timeout.

> `/verbose [on|off]` - toggle verbose mode (keep all messages)
>
> `/quiet [on|off]` - toggle quiet mode (make the group as quiet as possible)

>`/reverify` - start a new verification for a user manually
>
>`/pass` - pass the verification for a user manually
>
>`/fail` - fail the verification for a user manually

This bot is open sourced at <https://github.com/piggy-moe/sticker-captcha-bot>
