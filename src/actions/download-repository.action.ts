import { GitOpsCommands } from '../index';
import {} from '../utils/filesystem.util';
import { GitHubRepository } from '../utils/github.util';
import { LogLevel } from '../utils/logger.util';
import { GenericAction } from './generic.action';

export type DownloadRepositoryActionOptions =
    GitOpsCommands['DownloadRepository'];

export type DownloadRepositoryActionResponse = void;

export class DownloadRepositoryAction extends GenericAction<DownloadRepositoryActionResponse> {
    private readonly overwriteExisting: DownloadRepositoryActionOptions['overwriteExisting'];
    private readonly skipExisting: DownloadRepositoryActionOptions['skipExisting'];
    private readonly extractDownload: DownloadRepositoryActionOptions['extractDownload'];

    constructor(options: DownloadRepositoryActionOptions) {
        DownloadRepositoryAction.CLASS_NAME = 'DownloadRepositoryAction';

        super({
            gitConfigName: options.gitConfigName,
            logLevel: LogLevel[options.logLevel as keyof typeof LogLevel],
            organizations: options.organizations,
            repositoryList: options.repositoryList,
            excludeRepositories: options.excludeRepositories,
            repositories: options.repositories,
            ref: options.ref,
            command: DownloadRepositoryAction.CLASS_NAME,
            dryRun: options.dryRun
        });

        this.overwriteExisting = options.overwriteExisting;
        this.skipExisting = options.skipExisting;
        this.extractDownload = options.extractDownload;
    }

    public async run(): Promise<DownloadRepositoryActionResponse> {
        this.logger.info(
            `[${DownloadRepositoryAction.CLASS_NAME}.run]`,
            `Scraping repositories from ${this.organizations.length} organization(s)`
        );

        this.logger.debug(
            `[${DownloadRepositoryAction.CLASS_NAME}.run]`,
            `Git organizations to work on are:\n${this.organizations
                .map((organization, index) => {
                    return `[${index + 1}] ${organization}\n`;
                })
                .join('')}`
        );

        let rootFolder: string | undefined;
        if (!this.dryRun) {
            rootFolder = this.filesystemUtil.createFolder(
                `${this.filesystemUtil.getHomeDirectory()}/${
                    process.env.MODULE_NAME ?? 'gitops'
                }`
            );
        }

        for await (const organization of this.organizations) {
            const repositories =
                await this.listApplicableRepositoriesForOperation(organization);

            let organizationRootFolder: string | undefined;
            if (!this.dryRun) {
                organizationRootFolder = this.filesystemUtil.createFolder(
                    `${rootFolder}/${organization}`
                );
            }

            for await (const repository of repositories) {
                // When every loop starts, ensure that all previous terms are cleared
                this.logger.clearTermsFromLogPrefix();

                // Append the organization and repo name
                this.logger.appendTermToLogPrefix(repository.full_name);

                try {
                    await this.getRepo(repository, organizationRootFolder);
                } catch (e) {
                    this.logger.error(
                        `[${DownloadRepositoryAction.CLASS_NAME}.run]`,
                        `An error occured while scraping ${repository.full_name}`
                    );
                }
            }
        }

        this.logger.info(
            `[${DownloadRepositoryAction.CLASS_NAME}.run]`,
            `Operation completed.\n`,
            `View full output log at ${
                this.logger.getLogFilePaths().outputLog
            }\n`,
            `View full error log at ${this.logger.getLogFilePaths().errorLog}`
        );
    }

    private async getRepo(
        repository: GitHubRepository,
        rootFolderPath?: string
    ): Promise<void> {
        let repositoryRootFolder: string | undefined;
        if (!this.dryRun) {
            repositoryRootFolder = this.filesystemUtil.createFolder(
                `${rootFolderPath}/${repository.name}`
            );
        }

        await this.useGithubUtils(this.gitConfigName).downloadRepository(
            repository,
            repositoryRootFolder,
            this.ref,
            {
                overwriteExisting: this.overwriteExisting,
                skipExisting: this.skipExisting,
                extractDownload: this.extractDownload
            }
        );
    }
}
