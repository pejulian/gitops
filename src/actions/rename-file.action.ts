import _ from 'lodash';
import { GitToolkitCommands } from '../index';
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

export type RenameFileActionOptions = GitToolkitCommands['RenameFileAction'];

export type RenameFileActionResponse = void;

export class RenameFileAction extends GenericAction<RenameFileActionResponse> {
    private static readonly CLASS_NAME = 'RenameFileAction';

    private organizations: Array<string>;
    private repositories: string | undefined;
    private targetFilePath: string;
    private newFileName: string;
    private gitRef: string | undefined;

    constructor(options: RenameFileActionOptions) {
        super({
            githubToken: options.githubToken,
            logLevel: LogLevel[options.logLevel as keyof typeof LogLevel],
            tokenFilePath: options.tokenFilePath,
            command: RenameFileAction.CLASS_NAME
        });

        this.organizations = options.organizations;
        this.repositories = options.repositories;
        this.targetFilePath = options.targetFilePath;
        this.newFileName = options.newFileName;
        this.gitRef = options.ref;
    }

    public async run(): Promise<void> {
        this.logger.info(
            `[${RenameFileAction.CLASS_NAME}.run]`,
            `Renaming ${this.targetFilePath} to ${this.newFileName} in ${this.organizations.length} organization(s)`
        );

        this.logger.debug(
            `[${RenameFileAction.CLASS_NAME}.run]`,
            `Git organizations to work on are:\n${this.organizations
                .map((organization, index) => {
                    return `[${index + 1}] ${organization}\n`;
                })
                .join('')}\n`
        );

        const repositories =
            await this.listApplicableRepositoriesForOperation();

        for await (const repository of repositories) {
            // When every loop starts, ensure that all previous terms are cleared
            this.logger.clearTermsFromLogPrefix();

            // Append the organization and repo name
            this.logger.appendTermToLogPrefix(repository.full_name);

            const descriptorWithTree =
                await this.githubUtil.findTreeAndDescriptorForFilePath(
                    repository,
                    [this.targetFilePath],
                    this.gitRef ?? `heads/${repository.default_branch}`,
                    true
                );

            if (!descriptorWithTree?.descriptors?.[0]) {
                this.logger.warn(
                    `[${RenameFileAction.CLASS_NAME}.run]`,
                    `The target file path ${
                        this.targetFilePath
                    } was not found in ${repository.name} <${
                        this.gitRef ?? `heads/${repository.default_branch}`
                    }>`
                );

                continue;
            }

            await this.writeFileWithNewName(repository, descriptorWithTree);
        }

        this.logger.info(
            `[${RenameFileAction.CLASS_NAME}.run]`,
            `Operation completed.\n`,
            `View full output log at ${
                this.logger.getLogFilePaths().outputLog
            }\n`,
            `View full error log at ${this.logger.getLogFilePaths().errorLog}`
        );
    }

    /**
     * Obtains a list of repositories on which the given action should be applied on based on the provided criteria
     * @returns A list of organization repositories to apply this action on
     */
    public async listApplicableRepositoriesForOperation(): Promise<
        Array<GitHubRepository>
    > {
        let allRepositories: Array<GitHubRepository> = [];

        for await (const organization of this.organizations) {
            const repositories =
                await this.githubUtil.listRepositoriesForOrganization(
                    organization,
                    {
                        onlyInclude: this.repositories
                    }
                );

            this.logger.debug(
                `[${RenameFileAction.CLASS_NAME}.listApplicableRepositoriesForOperation]`,
                `Matched ${
                    repositories.length
                } repositories for ${organization}:\n${repositories
                    .map((repository, index) => {
                        return `[${index + 1}] ${repository.name} [${
                            this.gitRef ?? `heads/${repository.default_branch}`
                        }]\n`;
                    })
                    .join('')}\n`
            );

            allRepositories = [...allRepositories, ...repositories];
        }

        return allRepositories;
    }

    public async writeFileWithNewName(
        repository: GitHubRepository,
        descriptorWithTree: GitTreeWithFileDescriptor,
        options?: FilesystemWriteFileOptions
    ) {
        const fileContent = await this.githubUtil.getFileDescriptorContent(
            repository,
            descriptorWithTree?.descriptors?.[0],
            {
                ref: this.gitRef ?? `heads/${repository.default_branch}`
            }
        );

        // Remove the file descriptor representing the file that will be renamed
        const modifiedDescriptorWithTree: GitTreeWithFileDescriptor = {
            ...descriptorWithTree,
            tree: {
                ...descriptorWithTree.tree,
                tree: _(descriptorWithTree.tree.tree)
                    .filter((treeItem) => {
                        return (
                            treeItem.sha !==
                            descriptorWithTree.descriptors?.[0].sha
                        );
                    })
                    .value()
            }
        };

        const tmpDir = this.filesystemUtil.createSubdirectoryAtProjectRoot();

        const directoryPaths = FilesystemUtil.getDirectoryPartsFromPath(
            this.targetFilePath
        );

        let pathInConstruction = tmpDir;
        directoryPaths.forEach((directoryPath) => {
            pathInConstruction = `${tmpDir}/${directoryPath}`;
            this.filesystemUtil.createFolder(pathInConstruction);
        });

        this.filesystemUtil.writeFile(
            `${pathInConstruction}/${this.newFileName}`,
            fileContent,
            options
        );

        await this.githubUtil.uploadToRepository(
            tmpDir,
            repository,
            `Rename ${this.targetFilePath} to ${this.newFileName}`,
            this.gitRef ?? `heads/${repository.default_branch}`,
            modifiedDescriptorWithTree
        );

        this.filesystemUtil.removeDirectory(tmpDir);
    }
}
