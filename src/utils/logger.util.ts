import chalk from 'chalk';
import lodash from 'lodash';
import { Console } from 'console';
import os from 'os';
import fse from 'fs-extra';
import { formatISO } from 'date-fns';

const { compact, isEmpty } = lodash;

export enum LogLevel {
    ERROR = 0,
    WARN,
    INFO,
    DEBUG
}

export class LoggerUtil {
    private readonly _logLevel: LogLevel;
    private readonly _console: Console;
    private readonly _command: string;

    constructor(logLevel: LogLevel = LogLevel.ERROR, command: string) {
        this._logLevel = logLevel;
        this._command = command;

        this._console = new Console({
            stdout: fse.createWriteStream(
                `${os.homedir()}/${process.env.MODULE_NAME ?? 'git-toolkit'}-${
                    process.env.MODULE_VERSION ?? 'localhost'
                }-${command}-stdout.txt`
            ),
            stderr: fse.createWriteStream(
                `${os.homedir()}/${process.env.MODULE_NAME ?? 'git-toolkit'}-${
                    process.env.MODULE_VERSION ?? 'localhost'
                }-${command}-stderr.txt`
            )
        });
    }

    public getLogFilePaths(): Readonly<{
        errorLog: string;
        outputLog: string;
    }> {
        return {
            errorLog: `${os.homedir()}/${
                process.env.MODULE_NAME ?? 'git-toolkit'
            }-${process.env.MODULE_VERSION ?? 'localhost'}-${
                this._command
            }-stderr.txt`,
            outputLog: `${os.homedir()}/${
                process.env.MODULE_NAME ?? 'git-toolkit'
            }-${process.env.MODULE_VERSION ?? 'localhost'}-${
                this._command
            }-stderr.txt`
        };
    }

    public get logLevel(): LogLevel {
        return this._logLevel;
    }

    private isValidLogLevel(level: LogLevel): boolean {
        return level <= this._logLevel;
    }

    public error(message: string, ...args: Array<unknown>): void {
        this._console.error(formatISO(new Date()), `ERROR`, message, ...args);

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
        this._console.log(formatISO(new Date()), `WARN`, message, ...args);

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
        this._console.log(formatISO(new Date()), `INFO`, message, ...args);

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
        this._console.log(formatISO(new Date()), `DEBUG`, message, ...args);

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

    private filterArguments(args: Array<unknown>): Array<unknown> | undefined {
        if (isEmpty(args)) return undefined;
        return compact(
            args.map((arg) => {
                if (arg instanceof Error) {
                    return arg.message;
                }
                return arg;
            })
        );
    }
}
