import { FilesystemUtil } from '../utils/filesystem.util';
import { GitHubRepository, GithubUtil } from '../utils/github.util';
import { LoggerUtil, LogLevel } from '../utils/logger.util';
import { NpmUtil } from '../utils/npm.util';
import { ProcessorUtil } from '../utils/processsor.util';
import { SemverUtil } from '../utils/semver.util';
import { ActionReporter } from '../reporters/action.reporter';

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
     * The list of organizations to work on
     */
    organizations: Array<string>;
    /**
     * A regex of repos to consider for operations
     */
    repositories?: string;
    /**
     * A list of repositories to consider (overrides repositories)
     */
    repositoryList?: Array<string>;
    /**
     * A list of repositories to be excluded from consideration
     */
    excludeRepositories?: Array<string>;
    /**
     * The git reference to operate on for each repository
     */
    gitRef?: string;
    /**
     * The command name being executed
     */
    command: string;
}>;

export abstract class GenericAction<T> implements IGenericAction<T> {
    protected static CLASS_NAME = 'GenericAction';

    protected readonly logger: LoggerUtil;
    protected readonly githubUtil: GithubUtil;
    protected readonly filesystemUtil: FilesystemUtil;
    protected readonly processorUtil: ProcessorUtil;
    protected readonly semverUtil: SemverUtil;
    protected readonly npmUtil: NpmUtil;

    protected readonly actionReporter: ActionReporter;

    protected organizations: Array<string>;
    protected repositories: string | undefined;
    protected excludeRepositories: Array<string> | undefined;
    protected repositoryList: Array<string> | undefined;
    protected gitRef: string | undefined;

    constructor(options: GenericActionOptions) {
        GenericAction.CLASS_NAME = options.command;

        const logLevel = options.logLevel ?? LogLevel.ERROR;

        this.logger = new LoggerUtil(logLevel, options.command);

        this.actionReporter = new ActionReporter({
            logger: this.logger,
            command: options.command
        });

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

        this.excludeRepositories = options.excludeRepositories;
        this.repositories = options.repositories;
        this.repositoryList = options.repositoryList;
        this.organizations = options.organizations;
        this.gitRef = options.gitRef;
    }

    public async run(): Promise<T> {
        throw new Error('Method not implemented.');
    }

    /**
     * Obtains a list of repositories on which the given action should be applied on based on the provided criteria
     * @returns A list of organization repositories to apply this action on
     */
    protected async listApplicableRepositoriesForOperation(
        organization: string
    ): Promise<Array<GitHubRepository>> {
        let repositories: Array<GitHubRepository> = [];

        try {
            repositories =
                await this.githubUtil.listRepositoriesForOrganization(
                    organization,
                    {
                        onlyInclude: this.repositories,
                        excludeRepositories: this.excludeRepositories,
                        onlyFromList: this.repositoryList
                    }
                );

            this.logger.debug(
                `[${GenericAction.CLASS_NAME}.listApplicableRepositoriesForOperation]`,
                `Matched ${
                    repositories.length
                } repositories for ${organization}:\n${repositories
                    .map((repository, index) => {
                        return `[${index + 1}] ${repository.name} [${
                            this.gitRef ?? `heads/${repository.default_branch}`
                        }]`;
                    })
                    .join('\n')}`
            );
        } catch (e) {
            this.logger.warn(
                `[${GenericAction.CLASS_NAME}.listApplicableRepositoriesForOperation]`,
                `Error getting repositories for ${organization}. Operation will skip this organization.\n`,
                e
            );
        }

        return repositories;
    }
}
