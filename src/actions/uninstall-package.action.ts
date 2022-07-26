import { GitOpsCommands } from '../index';
import {
    GitHubRepository,
    GitTreeItem,
    GitTreeWithFileDescriptor
} from '../utils/github.util';
import { LogLevel } from '../utils/logger.util';
import { InstallModes, NpmUtil, PackageTypes } from '../utils/npm.util';
import { GenericAction } from './generic.action';
import _ from 'lodash';

export type UninstallPackageActionOptions = GitOpsCommands['UninstallPackage'];

export type UninstallPackageActionResponse = void;

export class UninstallPackageAction extends GenericAction<UninstallPackageActionResponse> {
    private packageName: string;
    private packageType: UninstallPackageActionOptions['packageType'];
    private packageUpdateConstraint: UninstallPackageActionOptions['packageUpdateConstraint'];
    private packageUpdateCondition: UninstallPackageActionOptions['packageUpdateCondition'];

    constructor(options: UninstallPackageActionOptions) {
        UninstallPackageAction.CLASS_NAME = 'UninstallPackageAction';

        super({
            githubToken: options.githubToken,
            logLevel: LogLevel[options.logLevel as keyof typeof LogLevel],
            tokenFilePath: options.tokenFilePath,
            organizations: options.organizations,
            repositoryList: options.repositoryList,
            excludeRepositories: options.excludeRepositories,
            repositories: options.repositories,
            gitRef: options.ref,
            command: UninstallPackageAction.CLASS_NAME
        });

        this.packageName = options.packageName;
        this.packageType = options.packageType;
        this.packageUpdateConstraint = options.packageUpdateConstraint;
        this.packageUpdateCondition = options.packageUpdateCondition;
    }

    public async run(): Promise<UninstallPackageActionResponse> {
        this.logger.info(
            `[${UninstallPackageAction.CLASS_NAME}.run]`,
            `Uninstalling ${this.packageName}`
        );

        this.logger.debug(
            `[${UninstallPackageAction.CLASS_NAME}.run]`,
            `Git organizations to work on are:\n${this.organizations
                .map((organization, index) => {
                    return `[${index + 1}] ${organization}\n`;
                })
                .join('')}`
        );

        try {
            // Run for every given organization
            for await (const organization of this.organizations) {
                const tmpDir =
                    this.filesystemUtil.createSubdirectoryAtProjectRoot();

                const repositories =
                    await this.listApplicableRepositoriesForOperation(
                        organization
                    );

                // Run for every fetched repository in the organization
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
                            `[${UninstallPackageAction.CLASS_NAME}.run]`,
                            `${NpmUtil.PACKAGE_JSON_FILE_NAME} and ${
                                NpmUtil.LOCKFILE_FILE_NAME
                            } was not found in ${repository.name} <${
                                this.gitRef ??
                                `heads/${repository.default_branch}`
                            }>`
                        );

                        continue;
                    }

                    const repoPath = await this.uninstallPackageForProject(
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
                            `Uninstall ${this.packageName} from ${
                                PackageTypes[this.packageType]
                            }`,
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
                            `[${UninstallPackageAction.CLASS_NAME}.run]`,
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
                `[${UninstallPackageAction.CLASS_NAME}.run]`,
                `Internal error while running the operation.\n`,
                e
            );
        }

        this.logger.info(
            `[${UninstallPackageAction.CLASS_NAME}.run]`,
            `Operation completed.\n`,
            `View full output log at ${
                this.logger.getLogFilePaths().outputLog
            }\n`,
            `View full error log at ${this.logger.getLogFilePaths().errorLog}`
        );
    }

    public async uninstallPackageForProject(
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
                `[${UninstallPackageAction.CLASS_NAME}.uninstallPackageForProject]`,
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
                `[${UninstallPackageAction.CLASS_NAME}.uninstallPackageForProject]`,
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
                `[${UninstallPackageAction.CLASS_NAME}.uninstallPackageForProject]`,
                `Failed to read ${NpmUtil.PACKAGE_JSON_FILE_NAME} descriptor`
            );
            throw e;
        }

        if (!lockfileDescriptorAndContent || !packageJsonDescriptorAndContent) {
            this.logger.error(
                `[${UninstallPackageAction.CLASS_NAME}.uninstallPackageForProject]`,
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

            const {
                packageType: theExistingPackageType,
                versionFound: theExistingVersion
            } = NpmUtil.doesDependencyExist(
                maybePackageJson,
                this.packageName,
                this.packageType,
                {
                    checkAll: true
                }
            );

            if (!theExistingVersion) {
                this.logger.info(
                    `[${UninstallPackageAction.CLASS_NAME}.uninstallPackageForProject]`,
                    `The package ${this.packageName} was not found in ${
                        repository.name
                    } in ${PackageTypes[this.packageType]}`
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

            // Now we will consider any constraints and conditions that are specified before proceeding with the uninstallation
            // If no constraint or condition is given, we will assume that any version given is good and will proceed with the uninstallation
            // If provided, we will first ensure that the existing package meets the given constraints and conditions before proceeeding
            // with the uninstallation.
            if (
                !(await this.npmUtil.shouldUpdatePackageVersion(
                    this.packageName,
                    theExistingVersion,
                    this.packageUpdateConstraint,
                    this.packageUpdateCondition
                ))
            ) {
                this.logger.info(
                    `[${UninstallPackageAction.CLASS_NAME}.uninstallPackageForProject]`,
                    `The update constraint was not fulfilled, package uninstall will be skipped`
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

            const uninstallExistingPackageResponse =
                await this.processorUtil.spawnProcess(
                    `npm`,
                    [
                        'uninstall',
                        `${this.packageName}`,
                        `${InstallModes[theExistingPackageType]}`
                    ],
                    {
                        cwd: repoPath
                    }
                );

            if (uninstallExistingPackageResponse.code !== 0) {
                this.logger.error(
                    `[${UninstallPackageAction.CLASS_NAME}.uninstallPackageForProject]`,
                    `The command ${uninstallExistingPackageResponse.command} failed to execute\n`,
                    uninstallExistingPackageResponse.response
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
                `[${UninstallPackageAction.CLASS_NAME}.uninstallPackageForProject]`,
                `The package uninstallation for ${this.packageName} failed\n`,
                e
            );

            return undefined;
        }
    }
}
