import { GitToolkitCommands } from '../index';
import { OrganizationRepository } from '../utils/github.util';
import { LogLevel } from '../utils/logger.util';
import { GenericAction } from './generic.action';

export type RenameFileActionOptions = GitToolkitCommands['RenameFileAction'];

export type RenameFileActionResponse = void;

export class RenameFileAction extends GenericAction<RenameFileActionResponse> {
    private static readonly CLASS_NAME = 'RenameFileAction';

    private organizations: Array<string>;
    private repositories: string | undefined;
    private targetFilePath: string;
    private gitRef: string;

    constructor(options: RenameFileActionOptions) {
        super({
            githubToken: options.githubToken,
            logLevel: LogLevel[options.logLevel as keyof typeof LogLevel],
            tokenFilePath: options.tokenFilePath
        });

        this.organizations = options.organizations;
        this.repositories = options.repositories;
        this.targetFilePath = options.targetFilePath;
        this.gitRef = options.ref;
    }

    public async run(): Promise<void> {
        this.logger.info(
            `[${RenameFileAction.CLASS_NAME}]`,
            `Git organizations to work on are:\n${this.organizations
                .map((organization, index) => {
                    return `[${index + 1}] ${organization}\n`;
                })
                .join('')}\n`
        );

        const repositories =
            await this.listApplicableRepositoriesForOperation();

        for (const repository of repositories) {
            const result =
                await this.githubUtils.findTreeAndDescriptorForFilePath(
                    repository,
                    this.targetFilePath,
                    this.gitRef
                );

            console.log(result);
        }
    }

    /**
     * Obtains a list of repositories on which the given action should be applied on based on the provided criteria
     * @returns A list of organization repositories to apply this action on
     */
    public async listApplicableRepositoriesForOperation(): Promise<
        Array<OrganizationRepository>
    > {
        let allRepositories: Array<OrganizationRepository> = [];

        for (const organization of this.organizations) {
            const repositories =
                await this.githubUtils.listRepositoriesForOrganization(
                    organization,
                    {
                        onlyInclude: this.repositories
                    }
                );

            this.logger.info(
                `[${RenameFileAction.CLASS_NAME}].listApplicableRepositoriesForOperation`,
                `Matched ${
                    repositories.length
                } repositories for ${organization}:\n${repositories
                    .map((respository, index) => {
                        return `[${index + 1}] ${respository.name}\n`;
                    })
                    .join('')}\n`
            );

            allRepositories = [...allRepositories, ...repositories];
        }

        return allRepositories;
    }
}
