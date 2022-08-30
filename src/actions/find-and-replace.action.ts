import { GitOpsCommands } from '../index';
import {
    FilesystemUtil,
    FilesystemWriteFileOptions
} from '../utils/filesystem.util';
import {
    GitHubRepository,
    GitTreeItem,
    FlattenedGitTree
} from '../utils/github.util';
import { LoggerUtil, LogLevel } from '../utils/logger.util';
import { GenericAction } from './generic.action';

export type FindAndReplaceActionOptions = GitOpsCommands['FindAndReplace'];

export type FindAndReplaceActionResponse = void;

export class FindAndReplaceAction extends GenericAction<FindAndReplaceActionResponse> {
    private readonly filesToMatch: Array<string>;
    private readonly searchFor: string;
    private readonly searchForFlags: string;
    private readonly replaceWith: string;

    constructor(options: FindAndReplaceActionOptions) {
        FindAndReplaceAction.CLASS_NAME = 'FindAndReplaceAction';

        super({
            githubToken: options.githubToken,
            logLevel: LogLevel[options.logLevel as keyof typeof LogLevel],
            tokenFilePath: options.tokenFilePath,
            organizations: options.organizations,
            repositoryList: options.repositoryList,
            excludeRepositories: options.excludeRepositories,
            repositories: options.repositories,
            ref: options.ref,
            command: FindAndReplaceAction.CLASS_NAME,
            dryRun: options.dryRun
        });

        this.filesToMatch = options.filesToMatch;
        this.searchFor = options.searchFor;
        this.searchForFlags = options.searchForFlags;
        this.replaceWith = options.replaceWith;
    }

    public async run(): Promise<FindAndReplaceActionResponse> {
        this.actionReporter.startReport(this.organizations, [
            `Finding and replacing ${this.searchFor} in matching repositories`
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
                    `[${FindAndReplaceAction.CLASS_NAME}.run]`,
                    `Failed to list repositories for the ${organization} organization\n`,
                    e
                );

                this.actionReporter.addGeneralError({
                    message: `Failed to list repositories for the ${organization} organization`
                });

                continue;
            }

            for await (const [
                innerIndex,
                repository
            ] of repositories.entries()) {
                this.actionReporter.addSubHeader([
                    `[${innerIndex + 1}|${repositories.length}] ${
                        repository.full_name
                    } <${this.ref ?? `heads/${repository.default_branch}`}>`
                ]);

                await this.findAndReplace(repository);
            }
        }

        this.actionReporter.completeReport();
    }

    private async findAndReplace(
        repository: GitHubRepository,
        options?: FilesystemWriteFileOptions
    ): Promise<void> {
        let gitTree: FlattenedGitTree;

        try {
            gitTree = await this.githubUtil.getRepositoryFullGitTree(
                repository,
                this.ref ?? `heads/${repository.default_branch}`,
                true
            );
        } catch (e) {
            this.logger.error(
                `[${FindAndReplaceAction.CLASS_NAME}.findAndReplace]`,
                `Error getting git tree for repository\n`,
                e
            );

            this.actionReporter.addFailed({
                name: repository.full_name,
                reason: `${LoggerUtil.getErrorMessage(e)}`,
                ref: this.ref ?? `heads/${repository.default_branch}`
            });

            return;
        }

        for (const fileToMatch of this.filesToMatch) {
            let matchedDescriptor: GitTreeItem;

            try {
                const result = this.githubUtil.findMatchingDescriptor(
                    gitTree.tree,
                    'blob',
                    fileToMatch
                );

                if (!result) {
                    this.logger.warn(
                        `[${FindAndReplaceAction.CLASS_NAME}.findAndReplace]`,
                        `The file ${fileToMatch} was not found`
                    );

                    this.actionReporter.addSkipped({
                        name: repository.full_name,
                        reason: `The file ${fileToMatch} was not found`,
                        ref: this.ref ?? `heads/${repository.default_branch}`
                    });

                    continue;
                }

                matchedDescriptor = result;
            } catch (e) {
                this.logger.error(
                    `[${FindAndReplaceAction.CLASS_NAME}.run]`,
                    `Error finding file descriptor\n`,
                    e
                );

                this.actionReporter.addSkipped({
                    name: repository.full_name,
                    reason: `Error finding file descriptor`,
                    ref: this.ref ?? `heads/${repository.default_branch}`
                });

                continue;
            }

            let fileContent: string;

            try {
                const result = await this.githubUtil.getFileDescriptorContent(
                    repository,
                    matchedDescriptor,
                    {
                        ref: this.ref ?? `heads/${repository.default_branch}`
                    }
                );

                fileContent = result;
            } catch (e) {
                this.logger.error(
                    `[${FindAndReplaceAction.CLASS_NAME}.findAndReplace]`,
                    `Error getting file descriptor content\n`,
                    e
                );

                this.actionReporter.addSkipped({
                    name: repository.full_name,
                    reason: `Error getting file descriptor content`,
                    ref: this.ref ?? `heads/${repository.default_branch}`
                });

                continue;
            }

            let tmpDir: string;

            try {
                tmpDir = this.filesystemUtil.createSubdirectoryAtProjectRoot();
            } catch (e) {
                this.logger.error(
                    `[${FindAndReplaceAction.CLASS_NAME}.findAndReplace]`,
                    `Failed to create temporary directory for operation\n`,
                    e
                );

                this.actionReporter.addFailed({
                    name: repository.full_name,
                    reason: `Failed to create temporary directory for operation`,
                    ref: this.ref ?? `heads/${repository.default_branch}`
                });

                continue;
            }

            if (!matchedDescriptor.path) {
                this.logger.error(
                    `[${FindAndReplaceAction.CLASS_NAME}.findAndReplace]`,
                    'Matched file descriptor does not contain a path'
                );

                this.actionReporter.addFailed({
                    name: repository.full_name,
                    reason: `Matched file descriptor does not contain a path`,
                    ref: this.ref ?? `heads/${repository.default_branch}`
                });

                continue;
            }

            try {
                const directoryPaths = FilesystemUtil.getDirectoryPartsFromPath(
                    matchedDescriptor.path
                );

                let pathInConstruction = tmpDir;
                directoryPaths.forEach((directoryPath) => {
                    pathInConstruction = `${tmpDir}/${directoryPath}`;
                    this.filesystemUtil.createFolder(pathInConstruction);
                });

                const regexp = new RegExp(this.searchFor, this.searchForFlags);
                const matches = fileContent.match(regexp);

                if (matches && matches.length > 0) {
                    this.logger.info(
                        `[${FindAndReplaceAction.CLASS_NAME}.findAndReplace]`,
                        `Found ${matches.length} ${
                            matches.length === 1 ? `match` : `matches`
                        } for ${this.searchFor} in ${matchedDescriptor.path}`
                    );

                    const replacedFileContent = fileContent.replace(
                        regexp,
                        this.replaceWith
                    );

                    this.logger.debug(
                        `[${FindAndReplaceAction.CLASS_NAME}.findAndReplace]`,
                        `File content replaced...`
                    );

                    this.filesystemUtil.writeFile(
                        `${pathInConstruction}/${FilesystemUtil.getFileNameFromPath(
                            matchedDescriptor.path
                        )}`,
                        replacedFileContent,
                        options
                    );

                    const uploadResponse =
                        await this.githubUtil.uploadToRepository(
                            tmpDir,
                            repository,
                            `Find and replace ${this.searchFor} to ${this.replaceWith} in ${matchedDescriptor.path}`,
                            this.ref ?? `heads/${repository.default_branch}`,
                            {
                                descriptors: [matchedDescriptor],
                                tree: gitTree
                            },
                            {
                                removeSubtrees: false // set this to false because we obtained the tree recursively (meaning that all paths in the repo at represented in a single Git tree object)
                            }
                        );

                    this.actionReporter.addSuccessful({
                        name: repository.full_name,
                        reason: `Completed: ${uploadResponse.ref}`,
                        ref: this.ref ?? `heads/${repository.default_branch}`
                    });
                } else {
                    this.logger.info(
                        `[${FindAndReplaceAction.CLASS_NAME}.findAndReplace]`,
                        `No matches for ${this.searchFor} in ${matchedDescriptor.path}`
                    );

                    this.actionReporter.addSkipped({
                        name: repository.full_name,
                        reason: `No matches for ${this.searchFor} in ${matchedDescriptor.path}`,
                        ref: this.ref ?? `heads/${repository.default_branch}`
                    });
                }
            } catch (e) {
                this.actionReporter.addFailed({
                    name: repository.full_name,
                    reason: `${LoggerUtil.getErrorMessage(e)}`,
                    ref: this.ref ?? `heads/${repository.default_branch}`
                });

                continue;
            }

            this.filesystemUtil.removeDirectory(tmpDir);
        }
    }
}
