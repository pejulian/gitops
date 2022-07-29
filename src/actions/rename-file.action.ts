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

export type RenameFileActionOptions = GitOpsCommands['RenameFile'];

export type RenameFileActionResponse = void;

export class RenameFileAction extends GenericAction<RenameFileActionResponse> {
    private targetFilePath: string;
    private newFileName: string;

    constructor(options: RenameFileActionOptions) {
        RenameFileAction.CLASS_NAME = 'RenameFileAction';

        super({
            githubToken: options.githubToken,
            logLevel: LogLevel[options.logLevel as keyof typeof LogLevel],
            tokenFilePath: options.tokenFilePath,
            organizations: options.organizations,
            repositoryList: options.repositoryList,
            excludeRepositories: options.excludeRepositories,
            repositories: options.repositories,
            gitRef: options.ref,
            command: RenameFileAction.CLASS_NAME
        });

        this.targetFilePath = options.targetFilePath;
        this.newFileName = options.newFileName;
        this.excludeRepositories = options.excludeRepositories;
        this.gitRef = options.ref;
    }

    public async run(): Promise<RenameFileActionResponse> {
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

                try {
                    await this.writeFileWithNewName(
                        repository,
                        descriptorWithTree
                    );
                } catch (e) {
                    this.logger.error(
                        `[${RenameFileAction.CLASS_NAME}.run]`,
                        `Internal error while running rename for the file ${this.targetFilePath} in ${repository.name}.\n`,
                        e
                    );

                    continue;
                }
            }
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
