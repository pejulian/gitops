import { LoggerUtil } from '../utils/logger.util';

export type RepositoryOutcome = Readonly<{
    name: string;
    reason: string;
    ref?: string;
}>;

export type GeneralOutcome = Readonly<{
    message: string;
}>;

export type ActionReporterOptions = Readonly<{
    logger: LoggerUtil;
    command: string;
}>;

export class ActionReporter {
    private successfulOperations: Array<RepositoryOutcome>;
    private skippedOperations: Array<RepositoryOutcome>;
    private failedOperations: Array<RepositoryOutcome>;
    private generalErrors: Array<GeneralOutcome>;

    private logger: LoggerUtil;

    constructor(options: ActionReporterOptions) {
        this.skippedOperations = [];
        this.failedOperations = [];
        this.successfulOperations = [];
        this.generalErrors = [];

        this.logger = options.logger;
    }

    public startReport(organizations: string[], messages: string[]) {
        this.addHeader([`Running ${this.logger.command}`, ...messages]);

        this.addSubHeader([
            `Git organizations to work on are:\n${organizations
                .map((organization, index) => {
                    return `[${index + 1}] ${organization}`;
                })
                .join('\n')}`
        ]);
    }

    public addGeneralError(attrs: GeneralOutcome): void {
        this.generalErrors.push(attrs);
    }

    public addSkipped(attrs: RepositoryOutcome): void {
        this.skippedOperations.push(attrs);
    }

    public addFailed(attrs: RepositoryOutcome): void {
        this.failedOperations.push(attrs);
    }

    public addSuccessful(attrs: RepositoryOutcome): void {
        this.successfulOperations.push(attrs);
    }

    public completeReport() {
        if (this.generalErrors.length > 0) {
            this.addSubHeader([
                `General errors`,
                ...this.generalErrors.map((report, index) => {
                    return `[${index + 1}] ${report.message}`;
                })
            ]);
        }

        if (this.successfulOperations.length > 0) {
            this.addSubHeader([
                `Successfully executed ${this.successfulOperations.length} operations`,
                ...this.successfulOperations.map((report, index) => {
                    return `[${index + 1}] ${report.name} <${report.ref}> : ${
                        report.reason
                    }`;
                })
            ]);
        }

        if (this.skippedOperations.length > 0) {
            this.addSubHeader([
                `Skipped ${this.skippedOperations.length} operations`,
                ...this.skippedOperations.map((report, index) => {
                    return `[${index + 1}] ${report.name} <${report.ref}> : ${
                        report.reason
                    }`;
                })
            ]);
        }

        if (this.failedOperations.length > 0) {
            this.addSubHeader([
                `Failed to execute ${this.failedOperations.length} operations`,
                ...this.failedOperations.map((report, index) => {
                    return `[${index + 1}] ${report.name} <${report.ref}> : ${
                        report.reason
                    }`;
                })
            ]);
        }

        this.addHeader([
            `Operation ${this.logger.command} completed`,
            `Full output: ${this.logger.getLogFilePaths().outputLog}`,
            `Error log: ${this.logger.getLogFilePaths().errorLog}`
        ]);
    }

    public addLine(messages: string[]) {
        this.logger.info(messages.join('\n'));
    }

    public addHeader(messages: string[]) {
        this.logger.debug(this.thickLine);
        this.logger.info(messages.join('\n'));
        this.logger.debug(this.thickLine);
    }

    public addSubHeader(messages: string[]) {
        this.logger.debug(this.thinLine);
        this.logger.info(messages.join('\n'));
        this.logger.debug(this.thinLine);
    }

    private get thickLine() {
        return `\n===============================================\n`;
    }

    private get thinLine() {
        return `\n-----------------------------------------------\n`;
    }
}
