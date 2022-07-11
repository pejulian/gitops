import _ from 'lodash';
import { GitToolkitCommands } from '../index';
import {
    FilesystemUtils,
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
        this.newFileName = options.newFileName;
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
            const descriptorWithTree =
                await this.githubUtils.findTreeAndDescriptorForFilePath(
                    repository,
                    this.targetFilePath,
                    this.gitRef,
                    true
                );

            if (!descriptorWithTree?.descriptor) {
                this.logger.warn(
                    `[${RenameFileAction.CLASS_NAME}]`,
                    `The target file path ${this.targetFilePath} was not found in ${repository.full_name} with ref ${this.gitRef}`
                );
                continue;
            }

            await this.writeFileWithNewName(repository, descriptorWithTree);
        }
    }

    /**
     * Obtains a list of repositories on which the given action should be applied on based on the provided criteria
     * @returns A list of organization repositories to apply this action on
     */
    public async listApplicableRepositoriesForOperation(): Promise<
        Array<GitHubRepository>
    > {
        let allRepositories: Array<GitHubRepository> = [];

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

    public async writeFileWithNewName(
        repository: GitHubRepository,
        descriptorWithTree: GitTreeWithFileDescriptor,
        options?: FilesystemWriteFileOptions
    ) {
        const fileContent = await this.githubUtils.getFileDescriptorContent(
            repository,
            this.targetFilePath,
            descriptorWithTree?.descriptor,
            {
                ref: this.gitRef
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
                            treeItem.sha !== descriptorWithTree.descriptor.sha
                        );
                    })
                    .value()
            }
        };

        const tmpDir = this.filesystemUtils.createSubdirectoryAtProjectRoot();

        const directoryPaths = FilesystemUtils.getDirectoryPartsFromPath(
            this.targetFilePath
        );

        let pathInConstruction = tmpDir;
        directoryPaths.forEach((directoryPath) => {
            pathInConstruction = `${tmpDir}/${directoryPath}`;
            this.filesystemUtils.createFolder(pathInConstruction);
        });

        this.filesystemUtils.writeFile(
            `${pathInConstruction}/${this.newFileName}`,
            fileContent,
            options
        );

        await this.githubUtils.uploadToRepository(
            tmpDir,
            repository,
            `Rename ${this.targetFilePath} to ${this.newFileName}`,
            this.gitRef,
            modifiedDescriptorWithTree
        );

        this.filesystemUtils.removeDirectory(tmpDir);
    }
}
