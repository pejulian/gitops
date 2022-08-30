import { MODULE_NAME, MODULE_VERSION } from '../index';
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

    private readonly _stdOutFile: string;
    private readonly _stdErrFile: string;

    private _terms: Array<string> = [];

    constructor(logLevel: LogLevel = LogLevel.ERROR, command: string) {
        this._logLevel = logLevel;
        this._command = command;

        this._stdOutFile = `${os.homedir()}/${MODULE_NAME}-${MODULE_VERSION}-${command}-${formatISO(
            new Date(),
            {
                format: 'basic'
            }
        )}-stdout.txt`;

        this._stdErrFile = `${os.homedir()}/${MODULE_NAME}-${MODULE_VERSION}-${command}-${formatISO(
            new Date(),
            {
                format: 'basic'
            }
        )}-stderr.txt`;

        this._console = new Console({
            stdout: fse.createWriteStream(this._stdOutFile),
            stderr: fse.createWriteStream(this._stdErrFile)
        });
    }

    public getLogFilePaths(): Readonly<{
        errorLog: string;
        outputLog: string;
    }> {
        return {
            errorLog: this._stdErrFile,
            outputLog: this._stdOutFile
        };
    }

    public get command(): string {
        return this._command;
    }

    public get logLevel(): LogLevel {
        return this._logLevel;
    }

    private isValidLogLevel(level: LogLevel): boolean {
        return level <= this._logLevel;
    }

    public appendTermToLogPrefix(term: string) {
        this._terms.push(term);
    }

    public clearTermsFromLogPrefix() {
        this._terms = [];
    }

    public error(message: string, ...args: Array<unknown>): void {
        const messageWithTerms = `${message} ${this._terms
            .map((term) => `[${term}]`)
            .join(' ')}`;

        this._console.error(
            formatISO(new Date()),
            `ERROR`,
            messageWithTerms,
            ...args
        );

        if (!this.isValidLogLevel(LogLevel.ERROR)) {
            return;
        }

        const filteredArguments = this.filterArguments(args);

        if (filteredArguments) {
            console.error(
                chalk.redBright(messageWithTerms),
                ...filteredArguments
            );
        } else {
            console.error(chalk.redBright(messageWithTerms));
        }
    }

    public warn(message: string, ...args: Array<unknown>): void {
        const messageWithTerms = `${message}${this._terms
            .map((term) => `[${term}]`)
            .join(' ')}`;

        this._console.log(
            formatISO(new Date()),
            `WARN`,
            messageWithTerms,
            ...args
        );

        if (!this.isValidLogLevel(LogLevel.WARN)) {
            return;
        }

        const filteredArguments = this.filterArguments(args);

        if (filteredArguments) {
            console.warn(
                chalk.yellowBright(messageWithTerms),
                ...filteredArguments
            );
        } else {
            console.warn(chalk.yellowBright(messageWithTerms));
        }
    }

    public info(message: string, ...args: Array<unknown>): void {
        const messageWithTerms = `${message}${this._terms
            .map((term) => `[${term}]`)
            .join(' ')}`;

        this._console.log(formatISO(new Date()), `INFO`, message, ...args);

        if (!this.isValidLogLevel(LogLevel.INFO)) {
            return;
        }

        const filteredArguments = this.filterArguments(args);

        if (filteredArguments) {
            console.info(
                chalk.greenBright(messageWithTerms),
                ...filteredArguments
            );
        } else {
            console.info(chalk.greenBright(messageWithTerms));
        }
    }

    public debug(message: string, ...args: Array<unknown>): void {
        const messageWithTerms = `${message}${this._terms
            .map((term) => `[${term}]`)
            .join(' ')}`;

        this._console.log(
            formatISO(new Date()),
            `DEBUG`,
            messageWithTerms,
            ...args
        );

        if (!this.isValidLogLevel(LogLevel.DEBUG)) {
            return;
        }

        const filteredArguments = this.filterArguments(args);

        if (filteredArguments) {
            console.debug(
                chalk.cyanBright(messageWithTerms),
                ...filteredArguments
            );
        } else {
            console.debug(chalk.cyanBright(messageWithTerms));
        }
    }

    public static getErrorMessage(e: unknown) {
        if (e instanceof Error) {
            return e.message;
        }
    }

    private filterArguments(args: Array<unknown>): Array<unknown> | undefined {
        if (isEmpty(args)) return undefined;
        return compact(
            args.map((arg) => {
                if (arg instanceof Error) {
                    return this._logLevel === LogLevel.DEBUG
                        ? arg
                        : arg.message;
                }
                return arg;
            })
        );
    }
}
