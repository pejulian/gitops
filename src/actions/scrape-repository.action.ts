import _ from 'lodash';
import { GitOpsCommands } from '../index';
import {
    FilesystemUtil,
    FilesystemWriteFileOptions
} from '../utils/filesystem.util';
import {
    GitTreeWithFileDescriptor,
    GitHubRepository
} from '../utils/github.util';
import { LogLevel } from '../utils/logger.util';
import { GenericAction } from './generic.action';

export type ScrapeRepositoryActionOptions = GitOpsCommands['ScrapeRepository'];

export type ScrapeRepositoryActionResponse = void;

export class ScrapeRepositoryAction extends GenericAction<ScrapeRepositoryActionResponse> {
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
            gitRef: options.ref,
            command: ScrapeRepositoryAction.CLASS_NAME
        });
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

        for await (const organization of this.organizations) {
            const repositories =
                await this.listApplicableRepositoriesForOperation(organization);

            for await (const repository of repositories) {
                // When every loop starts, ensure that all previous terms are cleared
                this.logger.clearTermsFromLogPrefix();

                // Append the organization and repo name
                this.logger.appendTermToLogPrefix(repository.full_name);

                try {
                    await this.scrapeRepository(repository);
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
        repository: GitHubRepository
    ): Promise<void> {
        console.log('TODO', repository);
    }
}
