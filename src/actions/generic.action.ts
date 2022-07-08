import { GithubUtils } from '../utils/github.util';
import { LoggerUtil, LogLevel } from '../utils/logger.util';

export interface IGenericAction<T> {
    run(): Promise<T>;
}

export type GenericActionOptions = Readonly<{
    /**
     * The log level to apply when making log statements
     */
    logLevel?: LogLevel;
    /**
     * The raw github personal access token value to use.
     * Will take precedence over `tokenFilePath` if defined.
     */
    githubToken?: string;
    /**
     * The path to the github personal access token file that has been stored
     * somewhere in the users' home directory.
     *
     * NOTE: The file must reside in the root or subdirectory OF THE USERS HOME DIRECTORY
     */
    tokenFilePath?: string;
}>;

export abstract class GenericAction<T> implements IGenericAction<T> {
    protected readonly logger: LoggerUtil;
    protected readonly githubUtils: GithubUtils;

    private readonly logLevel: LogLevel;

    constructor(options: GenericActionOptions) {
        this.logLevel = options.logLevel ?? LogLevel.ERROR;
        this.logger = new LoggerUtil(this.logLevel);

        this.githubUtils = new GithubUtils({
            githubToken: options.githubToken,
            tokenFilePath: options.tokenFilePath,
            logger: this.logger
        });
    }

    public async run(): Promise<T> {
        throw new Error('Method not implemented.');
    }
}
