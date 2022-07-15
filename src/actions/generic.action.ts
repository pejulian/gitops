import { FilesystemUtil } from '../utils/filesystem.util';
import { GithubUtil } from '../utils/github.util';
import { LoggerUtil, LogLevel } from '../utils/logger.util';
import { NpmUtil } from '../utils/npm.util';
import { ProcessorUtil } from '../utils/processsor.util';
import { SemverUtil } from '../utils/semver.util';

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
    /**
     * The command that this tool was invoked with
     */
    command: string;
}>;

export abstract class GenericAction<T> implements IGenericAction<T> {
    protected readonly logger: LoggerUtil;
    protected readonly githubUtil: GithubUtil;
    protected readonly filesystemUtil: FilesystemUtil;
    protected readonly processorUtil: ProcessorUtil;
    protected readonly semverUtil: SemverUtil;
    protected readonly npmUtil: NpmUtil;

    constructor(options: GenericActionOptions) {
        const logLevel = options.logLevel ?? LogLevel.ERROR;

        this.logger = new LoggerUtil(logLevel, options.command);

        this.processorUtil = new ProcessorUtil({
            logger: this.logger
        });

        this.semverUtil = new SemverUtil({
            logger: this.logger
        });

        this.npmUtil = new NpmUtil({
            logger: this.logger,
            processorUtil: this.processorUtil,
            semverUtil: this.semverUtil
        });

        this.filesystemUtil = new FilesystemUtil({
            logger: this.logger
        });

        this.githubUtil = new GithubUtil({
            githubToken: options.githubToken,
            tokenFilePath: options.tokenFilePath,
            logger: this.logger,
            filesystemUtils: this.filesystemUtil
        });
    }

    public async run(): Promise<T> {
        throw new Error('Method not implemented.');
    }
}
