import _ from 'lodash';
import { GitToolkitCommands } from '../index';
import {
    GitTreeWithFileDescriptor,
    GitHubRepository,
    GitTreeItem
} from '../utils/github.util';
import { LogLevel } from '../utils/logger.util';
import { NpmUtil } from '../utils/npm.util';
import { GenericAction } from './generic.action';

export type UpdatePackageVersionActionOptions =
    GitToolkitCommands['UpdatePackageVersion'];

export type UpdatePackageVersionActionResponse = void;

export class UpdatePackageVersionAction extends GenericAction<UpdatePackageVersionActionResponse> {
    private static readonly CLASS_NAME = 'UpdatePackageVersionAction';

    private organizations: Array<string>;
    private repositories: string | undefined;
    private gitRef: string | undefined;

    private packageName: string;
    private packageVersion: string;
    private packageType: UpdatePackageVersionActionOptions['packageType'];

    constructor(options: UpdatePackageVersionActionOptions) {
        super({
            githubToken: options.githubToken,
            logLevel: LogLevel[options.logLevel as keyof typeof LogLevel],
            tokenFilePath: options.tokenFilePath,
            command: UpdatePackageVersionAction.CLASS_NAME
        });

        this.organizations = options.organizations;
        this.repositories = options.repositories;
        this.gitRef = options.ref;

        this.packageName = options.packageName;
        this.packageVersion = options.packageVersion;
        this.packageType = options.packageType;
    }

    public async run(): Promise<void> {
        this.logger.info(
            `[${UpdatePackageVersionAction.CLASS_NAME}.run]`,
            `Updating ${this.packageName} to version ${this.packageVersion}`
        );

        this.logger.debug(
            `[${UpdatePackageVersionAction.CLASS_NAME}.run]`,
            `Git organizations to work on are:\n${this.organizations
                .map((organization, index) => {
                    return `[${index + 1}] ${organization}\n`;
                })
                .join('')}\n`
        );

        try {
            if (
                await this.npmUtil.doesPackageVersionExist(
                    this.packageName,
                    this.packageVersion
                )
            ) {
                const tmpDir =
                    this.filesystemUtil.createSubdirectoryAtProjectRoot();

                const repositories =
                    await this.listApplicableRepositoriesForOperation();

                for (const repository of repositories) {
                    const descriptorWithTree =
                        await this.githubUtil.findTreeAndDescriptorForFilePath(
                            repository,
                            [
                                NpmUtil.PACKAGE_JSON_FILE_NAME,
                                NpmUtil.LOCKFILE_FILE_NAME
                            ],
                            this.gitRef ?? `heads/${repository.default_branch}`
                        );

                    if (descriptorWithTree?.descriptors.length !== 2) {
                        this.logger.warn(
                            `[${UpdatePackageVersionAction.CLASS_NAME}.run]`,
                            `${NpmUtil.PACKAGE_JSON_FILE_NAME} and ${
                                NpmUtil.LOCKFILE_FILE_NAME
                            } was not found in ${repository.full_name} <${
                                this.gitRef ??
                                `heads/${repository.default_branch}`
                            }>`
                        );

                        continue;
                    }

                    const repoPath = await this.updatePackageVersionForProject(
                        repository,
                        descriptorWithTree.descriptors,
                        tmpDir
                    );

                    // If no repo path is returned, something wrong happened and we should skip...
                    if (!repoPath) {
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
                            `Update ${this.packageName} to version ${this.packageVersion}`,
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
                            `[${UpdatePackageVersionAction.CLASS_NAME}.run]`,
                            `Failed to upload changes`
                        );

                        continue;
                    }
                }

                this.filesystemUtil.removeDirectory(tmpDir);
            } else {
                this.logger.error(
                    `[${UpdatePackageVersionAction.CLASS_NAME}.run]`,
                    `The specified version ${this.packageVersion} does not exist for the package ${this.packageName}`
                );
            }
        } catch (e) {
            this.logger.error(
                `[${UpdatePackageVersionAction.CLASS_NAME}.run]`,
                `Internal error while running the operation`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
            );
        }

        this.logger.info(
            `[${UpdatePackageVersionAction.CLASS_NAME}.run]`,
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

        for (const organization of this.organizations) {
            let repositories: Array<GitHubRepository>;
            try {
                repositories =
                    await this.githubUtil.listRepositoriesForOrganization(
                        organization,
                        {
                            onlyInclude: this.repositories
                        }
                    );

                this.logger.debug(
                    `[${UpdatePackageVersionAction.CLASS_NAME}.listApplicableRepositoriesForOperation]`,
                    `Matched ${
                        repositories.length
                    } repositories for ${organization}:\n${repositories
                        .map((repository, index) => {
                            return `[${index + 1}] ${repository.name} [${
                                this.gitRef ??
                                `heads/${repository.default_branch}`
                            }]\n`;
                        })
                        .join('')}\n`
                );
            } catch (e) {
                this.logger.warn(
                    `[${UpdatePackageVersionAction.CLASS_NAME}.listApplicableRepositoriesForOperation]`,
                    `Error getting repositories for ${organization}. Operation will skip this organization.`
                );
                continue;
            }

            allRepositories = [...allRepositories, ...repositories];
        }

        return allRepositories;
    }

    public async updatePackageVersionForProject(
        repository: GitHubRepository,
        descriptors: GitTreeWithFileDescriptor['descriptors'],
        tmpDir: string
    ): Promise<string | undefined> {
        const orgPath = this.filesystemUtil.createFolder(
            `${tmpDir}/${repository.owner.login}`
        );

        const repoPath = this.filesystemUtil.createFolder(
            `${orgPath}/${repository.name}`
        );

        const descriptorWithContents: Array<{
            content: string;
            descriptor: GitTreeItem;
        }> = [];
        try {
            for (const descriptor of descriptors) {
                const content = await this.githubUtil.getFileDescriptorContent(
                    repository,
                    descriptor,
                    {
                        ref: this.gitRef ?? `heads/${repository.default_branch}`
                    }
                );
                descriptorWithContents.push({
                    content,
                    descriptor
                });
            }
        } catch (e) {
            this.logger.error(
                `[${UpdatePackageVersionAction.CLASS_NAME}.updatePackageVersionForProject]`,
                `Failed to obtain file contents for descriptors`
            );

            return undefined;
        }

        const lockfileDescriptorAndContent = _.find(
            descriptorWithContents,
            (item) =>
                item.descriptor.path?.includes(NpmUtil.LOCKFILE_FILE_NAME) ??
                false
        );
        const packageJsonDescriptorAndContent = _.find(
            descriptorWithContents,
            (item) =>
                item.descriptor.path?.includes(
                    NpmUtil.PACKAGE_JSON_FILE_NAME
                ) ?? false
        );

        if (!lockfileDescriptorAndContent || !packageJsonDescriptorAndContent) {
            this.logger.error(
                `[${UpdatePackageVersionAction.CLASS_NAME}.updatePackageVersionForProject]`,
                `Failed to resolve content for ${NpmUtil.PACKAGE_JSON_FILE_NAME} and ${NpmUtil.LOCKFILE_FILE_NAME}`
            );

            return undefined;
        }

        this.filesystemUtil.writeFile(
            `${repoPath}/${lockfileDescriptorAndContent.descriptor.path}`,
            lockfileDescriptorAndContent.content,
            {
                encoding: 'utf8'
            }
        );

        try {
            const maybePackageJson = this.npmUtil.parsePackageJson(
                packageJsonDescriptorAndContent.content
            );

            if (
                !NpmUtil.doesDependencyExist(
                    maybePackageJson,
                    this.packageName,
                    this.packageType
                )
            ) {
                this.logger.info(
                    `[${UpdatePackageVersionAction.CLASS_NAME}.updatePackageVersionForProject]`,
                    `The npm package ${this.packageName} is not installed in ${repository.full_name}`
                );

                return undefined;
            }

            // Remove any prepare scripts that might mess up this limited checkout and install
            const { packageJson, prepareScript } =
                this.npmUtil.removePrepareScript(maybePackageJson, {
                    removeOnlyWhen: {
                        keyword: 'husky'
                    }
                });

            packageJsonDescriptorAndContent.descriptor.mode;

            this.filesystemUtil.writeFile(
                `${repoPath}/${packageJsonDescriptorAndContent.descriptor.path}`,
                `${JSON.stringify(packageJson, undefined, 4)}\n`,
                {
                    encoding: 'utf8'
                }
            );

            const npmCiResponse = await this.processorUtil.spawnProcess(
                `npm`,
                ['ci'],
                {
                    cwd: repoPath
                }
            );

            if (npmCiResponse.code !== 0) {
                this.logger.error(
                    `[${UpdatePackageVersionAction.CLASS_NAME}.updatePackageVersionForProject]`,
                    `The command ${npmCiResponse.command} failed to execute\n`,
                    npmCiResponse.response
                );

                return undefined;
            }

            const updatePackageResponse = await this.processorUtil.spawnProcess(
                `npm`,
                [
                    'install',
                    `-${this.packageType}`,
                    `${this.packageName}@${this.packageVersion}`
                ],
                {
                    cwd: repoPath
                }
            );

            if (updatePackageResponse.code !== 0) {
                this.logger.error(
                    `[${UpdatePackageVersionAction.CLASS_NAME}.updatePackageVersionForProject]`,
                    `The command ${updatePackageResponse.command} failed to execute\n`,
                    updatePackageResponse.response
                );

                return undefined;
            }

            // If a prepare script was removed in the above operation, add it back...
            if (prepareScript) {
                const updatedPackageJson = this.filesystemUtil.readFile(
                    `${repoPath}/${packageJsonDescriptorAndContent.descriptor.path}`
                );

                const parsedUpdatedPackageJson =
                    this.npmUtil.parsePackageJson(updatedPackageJson);

                const restoredPackageJson = this.npmUtil.restorePrepareScript(
                    parsedUpdatedPackageJson,
                    prepareScript
                );

                this.filesystemUtil.writeFile(
                    `${repoPath}/${packageJsonDescriptorAndContent.descriptor.path}`,
                    `${JSON.stringify(restoredPackageJson, undefined, 4)}\n`,
                    {
                        encoding: 'utf8'
                    }
                );
            }

            return repoPath;
        } catch (e) {
            this.logger.error(
                `[${UpdatePackageVersionAction.CLASS_NAME}.updatePackageVersionForProject]`,
                `The package update for ${this.packageName} failed`
            );

            return undefined;
        }
    }
}
