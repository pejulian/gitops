import { GitOpsCommands } from '@root';
import {} from '@utils/filesystem.util';
import { GitHubRepository } from '@utils/github.util';
import { LogLevel } from '@utils/logger.util';
import { GenericAction } from '@actions/generic.action';

export type ScrapeRepositoryActionOptions = GitOpsCommands['ScrapeRepository'];

export type ScrapeRepositoryActionResponse = void;

export class ScrapeRepositoryAction extends GenericAction<ScrapeRepositoryActionResponse> {
    private readonly overwriteExisting: ScrapeRepositoryActionOptions['overwriteExisting'];
    private readonly skipExisting: ScrapeRepositoryActionOptions['skipExisting'];
    private readonly extractDownload: ScrapeRepositoryActionOptions['extractDownload'];

    constructor(options: ScrapeRepositoryActionOptions) {
        ScrapeRepositoryAction.CLASS_NAME = 'ScrapeRepositoryAction';

        super({
            githubToken: options.githubToken,
            logLevel: LogLevel[options.logLevel as keyof typeof LogLevel],
            tokenFilePath: options.tokenFilePath,
            organizations: options.organizations,
            repositoryList: options.repositoryList,
            excludeRepositories: options.excludeRepositories,
            repositories: options.repositories,
            ref: options.ref,
            command: ScrapeRepositoryAction.CLASS_NAME,
            dryRun: options.dryRun
        });

        this.overwriteExisting = options.overwriteExisting;
        this.skipExisting = options.skipExisting;
        this.extractDownload = options.extractDownload;
    }

    public async run(): Promise<ScrapeRepositoryActionResponse> {
        this.logger.info(
            `[${ScrapeRepositoryAction.CLASS_NAME}.run]`,
            `Scraping repositories from ${this.organizations.length} organization(s)`
        );

        this.logger.debug(
            `[${ScrapeRepositoryAction.CLASS_NAME}.run]`,
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
                    await this.scrapeRepository(
                        repository,
                        organizationRootFolder
                    );
                } catch (e) {
                    this.logger.error(
                        `[${ScrapeRepositoryAction.CLASS_NAME}.run]`,
                        `An error occured while scraping ${repository.full_name}`
                    );
                }
            }
        }

        this.logger.info(
            `[${ScrapeRepositoryAction.CLASS_NAME}.run]`,
            `Operation completed.\n`,
            `View full output log at ${
                this.logger.getLogFilePaths().outputLog
            }\n`,
            `View full error log at ${this.logger.getLogFilePaths().errorLog}`
        );
    }

    private async scrapeRepository(
        repository: GitHubRepository,
        rootFolderPath?: string
    ): Promise<void> {
        let repositoryRootFolder: string | undefined;
        if (!this.dryRun) {
            repositoryRootFolder = this.filesystemUtil.createFolder(
                `${rootFolderPath}/${repository.name}`
            );
        }

        await this.githubUtil.downloadRepository(
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
