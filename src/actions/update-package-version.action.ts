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
    private packageUpdateConstraint: UpdatePackageVersionActionOptions['packageUpdateConstraint'];
    private packageUpdateCondition: UpdatePackageVersionActionOptions['packageUpdateCondition'];

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
        this.packageUpdateConstraint = options.packageUpdateConstraint;
        this.packageUpdateCondition = options.packageUpdateCondition;
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
            // Determine if the package version that we are trying to update to exists
            const versionToUse = await this.npmUtil.doesPackageVersionExist(
                this.packageName,
                this.packageVersion
            );

            // If no such version for the package exists, then we stop processing here
            if (!versionToUse) {
                this.logger.info(
                    `[${UpdatePackageVersionAction.CLASS_NAME}.run]`,
                    `The specified version ${this.packageVersion} does not exist for the package ${this.packageName}`
                );
                return;
            }

            for await (const organization of this.organizations) {
                const tmpDir =
                    this.filesystemUtil.createSubdirectoryAtProjectRoot();

                const repositories =
                    await this.listApplicableRepositoriesForOperation(
                        organization
                    );

                for await (const repository of repositories) {
                    // When every loop starts, ensure that all previous terms are cleared
                    this.logger.clearTermsFromLogPrefix();

                    // Append the organization and repo name
                    this.logger.appendTermToLogPrefix(repository.full_name);

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
                        tmpDir,
                        versionToUse
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
                            `Failed to upload changes\n`,
                            e
                        );

                        continue;
                    }
                }

                this.filesystemUtil.removeDirectory(tmpDir);
            }
        } catch (e) {
            this.logger.error(
                `[${UpdatePackageVersionAction.CLASS_NAME}.run]`,
                `Internal error while running the operation.\n`,
                e
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
    public async listApplicableRepositoriesForOperation(
        organization: string
    ): Promise<Array<GitHubRepository>> {
        let repositories: Array<GitHubRepository> = [];

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
                            this.gitRef ?? `heads/${repository.default_branch}`
                        }]\n`;
                    })
                    .join('')}\n`
            );
        } catch (e) {
            this.logger.warn(
                `[${UpdatePackageVersionAction.CLASS_NAME}.listApplicableRepositoriesForOperation]`,
                `Error getting repositories for ${organization}. Operation will skip this organization.\n`,
                e
            );
        }

        return repositories;
    }

    public async updatePackageVersionForProject(
        repository: GitHubRepository,
        descriptors: GitTreeWithFileDescriptor['descriptors'],
        tmpDir: string,
        versionToUse: string
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

        const descriptorWithContents: Array<DescriptorWithContents> = [];
        try {
            for await (const descriptor of descriptors) {
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
                `Failed to obtain file contents for descriptors\n`,
                e
            );

            return undefined;
        }

        let lockfileDescriptorAndContent: DescriptorWithContents | undefined;

        try {
            lockfileDescriptorAndContent = _.find(
                descriptorWithContents,
                (item) =>
                    item.descriptor.path?.includes(
                        NpmUtil.LOCKFILE_FILE_NAME
                    ) ?? false
            );
        } catch (e) {
            this.logger.error(
                `[${UpdatePackageVersionAction.CLASS_NAME}.updatePackageVersionForProject]`,
                `Failed to read ${NpmUtil.LOCKFILE_FILE_NAME} descriptor\n`,
                e
            );
            throw e;
        }

        let packageJsonDescriptorAndContent: DescriptorWithContents | undefined;

        try {
            packageJsonDescriptorAndContent = _.find(
                descriptorWithContents,
                (item) =>
                    item.descriptor.path?.includes(
                        NpmUtil.PACKAGE_JSON_FILE_NAME
                    ) ?? false
            );
        } catch (e) {
            this.logger.error(
                `[${UpdatePackageVersionAction.CLASS_NAME}.updatePackageVersionForProject]`,
                `Failed to read ${NpmUtil.PACKAGE_JSON_FILE_NAME} descriptor`
            );
            throw e;
        }

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

            const theExistingVersion = NpmUtil.doesDependencyExist(
                maybePackageJson,
                this.packageName,
                this.packageType
            );

            if (!theExistingVersion) {
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

            // Now we will consider any constraints and conditions that are specified before proceeding with the update
            // If no constraint or condition is given, we will assume that any version given is good and will proceed with the update
            // If provided, we will first ensure that the existing package meets the given constraints and conditions before proceeeding
            // with the update.
            if (
                !(await this.npmUtil.shouldUpdatePackageVersion(
                    this.packageName,
                    theExistingVersion,
                    this.packageUpdateConstraint,
                    this.packageUpdateCondition
                ))
            ) {
                this.logger.info(
                    `[${UpdatePackageVersionAction.CLASS_NAME}.run]`,
                    `The update constraint was not fulfilled:- update will be skipped`
                );

                return undefined;
            }

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
                    `${this.packageName}@${versionToUse}`
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
                `The package update for ${this.packageName} failed\n`,
                e
            );

            return undefined;
        }
    }
}
