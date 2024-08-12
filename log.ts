import chalk from "chalk";
import winston from "winston";

export const logger = winston.createLogger({
    level: "silly",
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format((info) => {
            for (const k of Object.keys(info)) {
                if (info[k] === undefined)
                    info[k] = null;
            }
            return info;
        })(),
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf((info: winston.Logform.TransformableInfo) => {
                    let { timestamp, level, scope, message, ...meta } = info;
                    return [
                        timestamp,
                        level,
                        chalk.magenta(scope ?? "<unknown scope>"),
                        message,
                        ...Object.entries(meta)
                            .map(([k, v]) => `${chalk.blue(k)}=${JSON.stringify(v)}`),
                    ].join(" ");
                }),
            ),
        }),
        new winston.transports.File({
            filename: "sticker-captcha-bot.log",
            format: winston.format.json(),
        }),
    ],
});
