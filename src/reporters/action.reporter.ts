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
    private successfulRepositories: Array<RepositoryOutcome>;
    private skippedRepositories: Array<RepositoryOutcome>;
    private failedRepositories: Array<RepositoryOutcome>;
    private generalErrors: Array<GeneralOutcome>;

    private logger: LoggerUtil;

    constructor(options: ActionReporterOptions) {
        this.skippedRepositories = [];
        this.failedRepositories = [];
        this.successfulRepositories = [];
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
        this.skippedRepositories.push(attrs);
    }

    public addFailed(attrs: RepositoryOutcome): void {
        this.failedRepositories.push(attrs);
    }

    public addSuccessful(attrs: RepositoryOutcome): void {
        this.successfulRepositories.push(attrs);
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

        if (this.successfulRepositories.length > 0) {
            this.addSubHeader([
                `Successfully updated repositories`,
                ...this.successfulRepositories.map((report, index) => {
                    return `[${index + 1}] ${report.name} <${report.ref}> : ${
                        report.reason
                    }`;
                })
            ]);
        }

        if (this.skippedRepositories.length > 0) {
            this.addSubHeader([
                `Skipped repositories`,
                ...this.skippedRepositories.map((report, index) => {
                    return `[${index + 1}] ${report.name} <${report.ref}> : ${
                        report.reason
                    }`;
                })
            ]);
        }

        if (this.failedRepositories.length > 0) {
            this.addSubHeader([
                `Failed operation`,
                ...this.failedRepositories.map((report, index) => {
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
