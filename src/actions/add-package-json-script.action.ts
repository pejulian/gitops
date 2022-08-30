import { GitOpsCommands } from '../index';
import {
    GitHubRepository,
    GitTreeItem,
    GitTreeWithFileDescriptor
} from '../utils/github.util';
import { LoggerUtil, LogLevel } from '../utils/logger.util';
import { NpmUtil } from '../utils/npm.util';
import { GenericAction } from './generic.action';
import _ from 'lodash';

export type AddPackageJsonScriptActionOptions =
    GitOpsCommands['AddPackageJsonScript'];

export type AddPackageJsonScriptActionResponse = void;

export class AddPackageJsonScriptAction extends GenericAction<AddPackageJsonScriptActionResponse> {
    private scriptKey: string;
    private scriptValue: string;
    private overrideExistingScriptKey: boolean;

    constructor(options: AddPackageJsonScriptActionOptions) {
        AddPackageJsonScriptAction.CLASS_NAME = 'AddPackageJsonScriptAction';

        super({
            githubToken: options.githubToken,
            logLevel: LogLevel[options.logLevel as keyof typeof LogLevel],
            tokenFilePath: options.tokenFilePath,
            organizations: options.organizations,
            repositoryList: options.repositoryList,
            excludeRepositories: options.excludeRepositories,
            repositories: options.repositories,
            gitRef: options.ref,
            command: AddPackageJsonScriptAction.CLASS_NAME
        });

        this.scriptKey = options.scriptKey;
        this.scriptValue = options.scriptValue;
        this.overrideExistingScriptKey = options.overrideExistingScriptKey;
    }

    public async run(): Promise<AddPackageJsonScriptActionResponse> {
        this.actionReporter.startReport(this.organizations, [
            `Adding ${this.scriptKey} to "scripts" section of "${NpmUtil.PACKAGE_JSON_FILE_NAME}"`
        ]);

        // Run for every given organization
        for await (const [
            index,
            organization
        ] of this.organizations.entries()) {
            this.actionReporter.addSubHeader([
                `[${index + 1} | ${
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
                    `[${AddPackageJsonScriptAction.CLASS_NAME}.run]`,
                    `Failed to list repositories for the ${organization} organization\n`,
                    e
                );

                this.actionReporter.addGeneralError({
                    message: `${LoggerUtil.getErrorMessage(e)}`
                });

                continue;
            }

            let tmpDir: string;
            try {
                tmpDir = this.filesystemUtil.createSubdirectoryAtProjectRoot();
            } catch (e) {
                this.logger.error(
                    `[${AddPackageJsonScriptAction.CLASS_NAME}.run]`,
                    `Failed to create temporary directory for operation\n`,
                    e
                );

                this.actionReporter.addGeneralError({
                    message: `${LoggerUtil.getErrorMessage(e)}`
                });

                continue;
            }

            // Run for every fetched repository in the organization
            for await (const [
                innerIndex,
                repository
            ] of repositories.entries()) {
                this.actionReporter.addSubHeader([
                    `[${innerIndex + 1} | ${repositories.length}] ${
                        repository.full_name
                    } <${this.gitRef ?? `heads/${repository.default_branch}`}>`
                ]);

                let descriptorWithTree: GitTreeWithFileDescriptor;

                /**
                 * Find package.json
                 */
                try {
                    const findResults =
                        await this.githubUtil.findTreeAndDescriptorForFilePath(
                            repository,
                            [NpmUtil.PACKAGE_JSON_FILE_NAME],
                            this.gitRef ?? `heads/${repository.default_branch}`
                        );

                    if (findResults?.descriptors.length !== 1) {
                        this.logger.warn(
                            `[${AddPackageJsonScriptAction.CLASS_NAME}.run]`,
                            `${NpmUtil.PACKAGE_JSON_FILE_NAME} not found`
                        );

                        this.actionReporter.addSkipped({
                            name: repository.full_name,
                            reason: `${NpmUtil.PACKAGE_JSON_FILE_NAME} not found`,
                            ref:
                                this.gitRef ??
                                `heads/${repository.default_branch}`
                        });

                        continue;
                    }

                    descriptorWithTree = findResults;
                } catch (e) {
                    this.actionReporter.addFailed({
                        name: repository.full_name,
                        reason: `${LoggerUtil.getErrorMessage(e)}`,
                        ref: this.gitRef ?? `heads/${repository.default_branch}`
                    });

                    continue;
                }

                let repoPath: string;

                try {
                    const theRepoPath = await this.addScriptFromPackageJson(
                        repository,
                        descriptorWithTree.descriptors[0],
                        tmpDir
                    );

                    // If no repo path is returned, something wrong happened and we should skip...
                    if (!theRepoPath) {
                        this.actionReporter.addSkipped({
                            name: repository.full_name,
                            reason: `Adding of script was not done`,
                            ref:
                                this.gitRef ??
                                `heads/${repository.default_branch}`
                        });

                        continue;
                    }

                    repoPath = theRepoPath;
                } catch (e) {
                    this.actionReporter.addFailed({
                        name: repository.full_name,
                        reason: `${LoggerUtil.getErrorMessage(e)}`,
                        ref: this.gitRef ?? `heads/${repository.default_branch}`
                    });

                    continue;
                }

                // Remove any file descriptors that match
                _.remove(descriptorWithTree.tree.tree, (treeItem) => {
                    const shaMatch = _.find(
                        descriptorWithTree.descriptors,
                        (item) => item.sha === treeItem.sha
                    );

                    return shaMatch ? true : false;
                });

                try {
                    await this.githubUtil.uploadToRepository(
                        repoPath,
                        repository,
                        `Added "${this.scriptKey}" to "scripts" in ${NpmUtil.PACKAGE_JSON_FILE_NAME}`,
                        this.gitRef ?? `heads/${repository.default_branch}`,
                        descriptorWithTree,
                        {
                            removeSubtrees: false, // set to false because we didnt obtain the tree recursively
                            globOptions: {
                                deep: 1,
                                onlyFiles: true
                            }
                        }
                    );
                } catch (e) {
                    this.logger.warn(
                        `[${AddPackageJsonScriptAction.CLASS_NAME}.run]`,
                        `Failed to commit changes\n`,
                        e
                    );

                    this.actionReporter.addFailed({
                        name: repository.full_name,
                        reason: `${LoggerUtil.getErrorMessage(e)}`,
                        ref: this.gitRef ?? `heads/${repository.default_branch}`
                    });

                    continue;
                }

                this.actionReporter.addSuccessful({
                    name: repository.full_name,
                    reason: `Added ${this.scriptKey} successfully`,
                    ref: this.gitRef ?? `heads/${repository.default_branch}`
                });
            }

            this.filesystemUtil.removeDirectory(tmpDir);
        }

        this.actionReporter.completeReport();
    }

    public async addScriptFromPackageJson(
        repository: GitHubRepository,
        descriptor: GitTreeItem,
        tmpDir: string
    ): Promise<string | undefined> {
        const orgPath = this.filesystemUtil.createFolder(
            `${tmpDir}/${repository.owner.login}`
        );

        const repoPath = this.filesystemUtil.createFolder(
            `${orgPath}/${repository.name}`
        );

        type DescriptorWithContents = {
            content: string;
            descriptor: GitTreeItem;
        };

        // Get file descriptor and content
        let descriptorWithContents: DescriptorWithContents;
        try {
            const content = await this.githubUtil.getFileDescriptorContent(
                repository,
                descriptor,
                {
                    ref: this.gitRef ?? `heads/${repository.default_branch}`
                }
            );

            descriptorWithContents = {
                content,
                descriptor
            };
        } catch (e) {
            this.logger.error(
                `[${AddPackageJsonScriptAction.CLASS_NAME}.addScriptFromPackageJson]`,
                `Failed to obtain file content for descriptor\n`,
                e
            );

            // Don't throw an error because this is not an error in the execution itself
            // but rather the nature of the repository which did not meet the criteria
            // for this operation.
            return undefined;
        }

        // Verify file descriptor and content
        let packageJsonDescriptorAndContent: DescriptorWithContents | undefined;
        try {
            if (
                descriptorWithContents.descriptor.path?.includes(
                    NpmUtil.PACKAGE_JSON_FILE_NAME
                )
            ) {
                packageJsonDescriptorAndContent = descriptorWithContents;
            }
        } catch (e) {
            this.logger.error(
                `[${AddPackageJsonScriptAction.CLASS_NAME}.addScriptFromPackageJson]`,
                `Failed to read ${NpmUtil.PACKAGE_JSON_FILE_NAME} descriptor`
            );

            // Its possible that a repo doesn't have a package.json
            return undefined;
        }

        if (!packageJsonDescriptorAndContent) {
            this.logger.error(
                `[${AddPackageJsonScriptAction.CLASS_NAME}.addScriptFromPackageJson]`,
                `Failed to read content for ${NpmUtil.PACKAGE_JSON_FILE_NAME}`
            );

            // Don't throw an error here because it is possible that a repository may not have these files...
            return undefined;
        }

        try {
            const maybePackageJson = this.npmUtil.parsePackageJson(
                packageJsonDescriptorAndContent.content
            );

            // Remove the script if its key is found in the scripts section of package.json
            const modifiedPackageJson = this.npmUtil.addScript(
                maybePackageJson,
                this.scriptKey,
                this.scriptValue,
                {
                    overrideExistingScriptKey: this.overrideExistingScriptKey
                }
            );

            if (typeof modifiedPackageJson === 'boolean') {
                this.logger.info(
                    `[${AddPackageJsonScriptAction.CLASS_NAME}.addScriptFromPackageJson]`,
                    `No changes were made to ${NpmUtil.PACKAGE_JSON_FILE_NAME}`
                );

                return;
            }

            this.filesystemUtil.writeFile(
                `${repoPath}/${packageJsonDescriptorAndContent.descriptor.path}`,
                `${JSON.stringify(modifiedPackageJson, undefined, 4)}\n`,
                {
                    encoding: 'utf8'
                }
            );

            return repoPath;
        } catch (e) {
            this.logger.error(
                `[${AddPackageJsonScriptAction.CLASS_NAME}.addScriptFromPackageJson]`,
                `Adding of script with key "${this.scriptKey}" failed\n`,
                e
            );

            throw e;
        }
    }
}
