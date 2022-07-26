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

export type InstallPackageActionOptions = GitOpsCommands['InstallPackage'];

export type InstallPackageActionResponse = void;

export class InstallPackageAction extends GenericAction<InstallPackageActionResponse> {
    private packageName: string;
    private packageVersion: string;
    private packageType: InstallPackageActionOptions['packageType'];

    constructor(options: InstallPackageActionOptions) {
        InstallPackageAction.CLASS_NAME = 'InstallPackageAction';

        super({
            githubToken: options.githubToken,
            logLevel: LogLevel[options.logLevel as keyof typeof LogLevel],
            tokenFilePath: options.tokenFilePath,
            organizations: options.organizations,
            repositoryList: options.repositoryList,
            excludeRepositories: options.excludeRepositories,
            repositories: options.repositories,
            gitRef: options.ref,
            command: InstallPackageAction.CLASS_NAME
        });

        this.packageName = options.packageName;
        this.packageVersion = options.packageVersion;
        this.packageType = options.packageType;
    }

    public async run(): Promise<InstallPackageActionResponse> {
        this.logger.info(
            `[${InstallPackageAction.CLASS_NAME}.run]`,
            `Installing ${this.packageName} with version ${this.packageVersion}`
        );

        this.logger.debug(
            `[${InstallPackageAction.CLASS_NAME}.run]`,
            `Git organizations to work on are:\n${this.organizations
                .map((organization, index) => {
                    return `[${index + 1}] ${organization}\n`;
                })
                .join('')}`
        );

        try {
            // Determine if the package version that we are trying to reinstall exists
            const versionToUse = await this.npmUtil.doesPackageVersionExist(
                this.packageName,
                this.packageVersion
            );

            // If no such version for the package exists, then we stop processing here
            if (!versionToUse) {
                this.logger.info(
                    `[${InstallPackageAction.CLASS_NAME}.run]`,
                    `The specified version ${this.packageVersion} does not exist for the package ${this.packageName}`
                );
                return;
            }

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
                            `[${InstallPackageAction.CLASS_NAME}.run]`,
                            `${NpmUtil.PACKAGE_JSON_FILE_NAME} and ${
                                NpmUtil.LOCKFILE_FILE_NAME
                            } was not found in ${repository.name} <${
                                this.gitRef ??
                                `heads/${repository.default_branch}`
                            }>`
                        );

                        continue;
                    }

                    const repoPath = await this.installPackageForProject(
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
                            `Install ${this.packageName} with version ${
                                this.packageVersion
                            } in ${PackageTypes[this.packageType]}`,
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
                            `[${InstallPackageAction.CLASS_NAME}.run]`,
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
                `[${InstallPackageAction.CLASS_NAME}.run]`,
                `Internal error while running the operation.\n`,
                e
            );
        }

        this.logger.info(
            `[${InstallPackageAction.CLASS_NAME}.run]`,
            `Operation completed.\n`,
            `View full output log at ${
                this.logger.getLogFilePaths().outputLog
            }\n`,
            `View full error log at ${this.logger.getLogFilePaths().errorLog}`
        );
    }

    public async installPackageForProject(
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
                `[${InstallPackageAction.CLASS_NAME}.installPackageForProject]`,
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
                `[${InstallPackageAction.CLASS_NAME}.installPackageForProject]`,
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
                `[${InstallPackageAction.CLASS_NAME}.installPackageForProject]`,
                `Failed to read ${NpmUtil.PACKAGE_JSON_FILE_NAME} descriptor`
            );
            throw e;
        }

        if (!lockfileDescriptorAndContent || !packageJsonDescriptorAndContent) {
            this.logger.error(
                `[${InstallPackageAction.CLASS_NAME}.installPackageForProject]`,
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

            // Remove any prepare scripts that might mess up this limited checkout and install
            const { packageJson, prepareScript } =
                this.npmUtil.removePrepareScript(maybePackageJson, {
                    removeOnlyWhen: {
                        keyword: 'husky'
                    }
                });

            this.filesystemUtil.writeFile(
                `${repoPath}/${packageJsonDescriptorAndContent.descriptor.path}`,
                `${JSON.stringify(packageJson, undefined, 4)}\n`,
                {
                    encoding: 'utf8'
                }
            );

            const installPackageResponse =
                await this.processorUtil.spawnProcess(
                    `npm`,
                    [
                        'install',
                        `${this.packageName}@${versionToUse}`,
                        `${InstallModes[this.packageType]}`
                    ],
                    {
                        cwd: repoPath
                    }
                );

            if (installPackageResponse.code !== 0) {
                this.logger.error(
                    `[${InstallPackageAction.CLASS_NAME}.installPackageForProject]`,
                    `The command ${installPackageResponse.command} failed to execute\n`,
                    installPackageResponse.response
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
                `[${InstallPackageAction.CLASS_NAME}.installPackageForProject]`,
                `Installation of ${this.packageName} failed\n`,
                e
            );

            return undefined;
        }
    }
}
