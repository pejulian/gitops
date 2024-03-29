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
import { LoggerUtil, LogLevel } from '../utils/logger.util';
import { GenericAction } from './generic.action';

export type RenameFileActionOptions = GitOpsCommands['RenameFile'];

export type RenameFileActionResponse = void;

export class RenameFileAction extends GenericAction<RenameFileActionResponse> {
    private targetFilePath: string;
    private newFileName: string;

    constructor(options: RenameFileActionOptions) {
        RenameFileAction.CLASS_NAME = 'RenameFileAction';

        super({
            gitConfigName: options.gitConfigName,
            logLevel: LogLevel[options.logLevel as keyof typeof LogLevel],
            organizations: options.organizations,
            repositoryList: options.repositoryList,
            excludeRepositories: options.excludeRepositories,
            repositories: options.repositories,
            ref: options.ref,
            command: RenameFileAction.CLASS_NAME,
            dryRun: options.dryRun
        });

        this.targetFilePath = options.targetFilePath;
        this.newFileName = options.newFileName;
    }

    public async run(): Promise<RenameFileActionResponse> {
        this.actionReporter.startReport(this.organizations, [
            `Renaming ${this.targetFilePath} to ${this.newFileName}`
        ]);

        for await (const [
            index,
            organization
        ] of this.organizations.entries()) {
            this.actionReporter.addSubHeader([
                `[${index + 1}|${
                    this.organizations.length
                }] Running for the organization ${organization}`
            ]);

            let repositories: Array<GitHubRepository>;

            try {
                repositories =
                    await this.listApplicableRepositoriesForOperation(
                        organization
                    );
            } catch (e) {
                this.logger.error(
                    `[${RenameFileAction.CLASS_NAME}.run]`,
                    `Failed to list repositories for the ${organization} organization\n`,
                    e
                );

                this.actionReporter.addGeneralError({
                    message: `${LoggerUtil.getErrorMessage(e)}`
                });

                continue;
            }

            let descriptorWithTree: GitTreeWithFileDescriptor;

            for await (const [
                innerIndex,
                repository
            ] of repositories.entries()) {
                this.actionReporter.addSubHeader([
                    `[${innerIndex + 1}|${repositories.length}] ${
                        repository.full_name
                    } <${this.ref ?? `heads/${repository.default_branch}`}>`
                ]);

                const findResults = await this.useGithubUtils(
                    this.gitConfigName
                ).findTreeAndDescriptorForFilePath(
                    repository,
                    [this.targetFilePath],
                    this.ref ?? `heads/${repository.default_branch}`,
                    true
                );

                if (!findResults?.descriptors?.[0]) {
                    this.logger.warn(
                        `[${RenameFileAction.CLASS_NAME}.run]`,
                        `The target file path ${this.targetFilePath} was not found`
                    );

                    this.actionReporter.addSkipped({
                        name: repository.full_name,
                        reason: `The target file path ${this.targetFilePath} was not found`,
                        ref: this.ref ?? `heads/${repository.default_branch}`
                    });

                    continue;
                }

                descriptorWithTree = findResults;

                try {
                    await this.writeFileWithNewName(
                        repository,
                        descriptorWithTree
                    );
                } catch (e) {
                    this.logger.error(
                        `[${RenameFileAction.CLASS_NAME}.run]`,
                        `Error renaming the file ${this.targetFilePath} in ${repository.name}.\n`,
                        e
                    );

                    this.actionReporter.addFailed({
                        name: repository.full_name,
                        reason: `${LoggerUtil.getErrorMessage(e)}`,
                        ref: this.ref ?? `heads/${repository.default_branch}`
                    });

                    continue;
                }
            }
        }

        this.actionReporter.completeReport();
    }

    public async writeFileWithNewName(
        repository: GitHubRepository,
        descriptorWithTree: GitTreeWithFileDescriptor,
        options?: FilesystemWriteFileOptions
    ) {
        const fileContent = await this.useGithubUtils(
            this.gitConfigName
        ).getFileDescriptorContent(
            repository,
            descriptorWithTree?.descriptors?.[0],
            {
                ref: this.ref ?? `heads/${repository.default_branch}`
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

        if (!this.dryRun) {
            await this.useGithubUtils(this.gitConfigName).uploadToRepository(
                tmpDir,
                repository,
                `Rename ${this.targetFilePath} to ${this.newFileName}`,
                this.ref ?? `heads/${repository.default_branch}`,
                modifiedDescriptorWithTree
            );
        } else {
            this.logger.info(
                `[${RenameFileAction.CLASS_NAME}.run]`,
                `Dry run mode enabled, changes will not be commited`
            );
        }

        this.filesystemUtil.removeDirectory(tmpDir);
    }
}
