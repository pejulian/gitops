import chalk from 'chalk';

export enum LogLevel {
    ERROR = 0,
    WARN,
    INFO,
    DEBUG
}

export class LoggerUtil {
    private readonly _logLevel: LogLevel;

    constructor(logLevel: LogLevel) {
        this._logLevel = logLevel;
    }

    public get logLevel(): LogLevel {
        return this._logLevel;
    }

    private isValidLogLevel(level: LogLevel): boolean {
        return level <= this._logLevel;
    }

    private filterArguments(args: Array<unknown>): Array<unknown> | undefined {
        if (typeof args === 'undefined' || args === null) {
            return undefined;
        }

        if (!Array.isArray(args) || args.length === 0) {
            return undefined;
        }

        const filteredArgs = args?.filter(
            (arg) => typeof arg !== 'undefined' && arg !== null
        );

        return filteredArgs;
    }

    public error(message: string, ...args: Array<unknown>): void {
        if (!this.isValidLogLevel(LogLevel.ERROR)) {
            return;
        }

        const filteredArguments = this.filterArguments(args);
        if (filteredArguments) {
            console.error(chalk.redBright(message), ...filteredArguments);
        } else {
            console.error(chalk.redBright(message));
        }
    }

    public warn(message: string, ...args: Array<unknown>): void {
        if (!this.isValidLogLevel(LogLevel.WARN)) {
            return;
        }

        const filteredArguments = this.filterArguments(args);
        if (filteredArguments) {
            console.warn(chalk.yellowBright(message), ...filteredArguments);
        } else {
            console.warn(chalk.yellowBright(message));
        }
    }

    public info(message: string, ...args: Array<unknown>): void {
        if (!this.isValidLogLevel(LogLevel.INFO)) {
            return;
        }

        const filteredArguments = this.filterArguments(args);
        if (filteredArguments) {
            console.info(chalk.greenBright(message), ...filteredArguments);
        } else {
            console.info(chalk.greenBright(message));
        }
    }

    public debug(message: string, ...args: Array<unknown>): void {
        if (!this.isValidLogLevel(LogLevel.DEBUG)) {
            return;
        }

        const filteredArguments = this.filterArguments(args);
        if (filteredArguments) {
            console.debug(chalk.cyanBright(message), ...filteredArguments);
        } else {
            console.debug(chalk.cyanBright(message));
        }
    }
}
