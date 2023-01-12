import { GitOpsCommands } from '../index';
import {
    GitHubRepository,
    GitTreeItem,
    GitTreeWithFileDescriptor
} from '../utils/github.util';
import { LoggerUtil, LogLevel } from '../utils/logger.util';
import { InstallModes, NpmUtil, PackageTypes } from '../utils/npm.util';
import { GenericAction } from './generic.action';
import _find from 'lodash/find';
import _remove from 'lodash/remove';

export type ReinstallPackageActionOptions = GitOpsCommands['ReinstallPackage'];

export type ReinstallPackageActionResponse = void;

export class ReinstallPackageAction extends GenericAction<ReinstallPackageActionResponse> {
    private packageName: string;
    private packageVersion: string;
    private packageType: ReinstallPackageActionOptions['packageType'];
    private packageUpdateConstraint: ReinstallPackageActionOptions['packageUpdateConstraint'];
    private packageUpdateCondition: ReinstallPackageActionOptions['packageUpdateCondition'];

    constructor(options: ReinstallPackageActionOptions) {
        ReinstallPackageAction.CLASS_NAME = 'ReinstallPackageAction';

        super({
            gitConfigName: options.gitConfigName,
            logLevel: LogLevel[options.logLevel as keyof typeof LogLevel],
            organizations: options.organizations,
            repositoryList: options.repositoryList,
            excludeRepositories: options.excludeRepositories,
            repositories: options.repositories,
            ref: options.ref,
            command: ReinstallPackageAction.CLASS_NAME,
            dryRun: options.dryRun
        });

        this.packageName = options.packageName;
        this.packageVersion = options.packageVersion;
        this.packageType = options.packageType;
        this.packageUpdateConstraint = options.packageUpdateConstraint;
        this.packageUpdateCondition = options.packageUpdateCondition;
    }

    public async run(): Promise<ReinstallPackageActionResponse> {
        this.actionReporter.startReport(this.organizations, [
            `Reinstalling ${this.packageName} to version ${this.packageVersion}`
        ]);

        let versionToUse: string;

        try {
            // Determine if the package version that we are trying to reinstall exists
            const response = await this.npmUtil.doesPackageVersionExist(
                this.packageName,
                this.packageVersion
            );

            // If no such version for the package exists, then we stop processing here
            if (!response) {
                this.logger.info(
                    `[${ReinstallPackageAction.CLASS_NAME}.run]`,
                    `The specified version ${this.packageVersion} does not exist for the package ${this.packageName}`
                );

                throw new Error(
                    `The specified version ${this.packageVersion} does not exist for the package ${this.packageName}`
                );
            }

            versionToUse = response;
        } catch (e) {
            this.logger.error(
                `[${ReinstallPackageAction.CLASS_NAME}.run]`,
                `Failed to check if package version exists.\n`,
                e
            );

            this.actionReporter.addGeneralError({
                message: `${LoggerUtil.getErrorMessage(e)}`
            });

            this.actionReporter.completeReport();

            return;
        }

        // Run for every given organization
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
                    `[${ReinstallPackageAction.CLASS_NAME}.run]`,
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
                    `[${ReinstallPackageAction.CLASS_NAME}.run]`,
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
                    `[${innerIndex + 1}|${repositories.length}] ${
                        repository.full_name
                    } <${this.ref ?? `heads/${repository.default_branch}`}>`
                ]);

                let descriptorWithTree: GitTreeWithFileDescriptor;

                try {
                    const findResults = await this.useGithubUtils(
                        this.gitConfigName
                    ).findTreeAndDescriptorForFilePath(
                        repository,
                        [
                            NpmUtil.PACKAGE_JSON_FILE_NAME,
                            NpmUtil.LOCKFILE_FILE_NAME
                        ],
                        this.ref ?? `heads/${repository.default_branch}`
                    );

                    if (findResults?.descriptors.length !== 2) {
                        this.logger.warn(
                            `[${ReinstallPackageAction.CLASS_NAME}.run]`,
                            `${NpmUtil.PACKAGE_JSON_FILE_NAME} and ${NpmUtil.LOCKFILE_FILE_NAME} was not found`
                        );

                        this.actionReporter.addSkipped({
                            name: repository.full_name,
                            reason: `${NpmUtil.PACKAGE_JSON_FILE_NAME} and ${NpmUtil.LOCKFILE_FILE_NAME} was not found`,
                            ref:
                                this.ref ?? `heads/${repository.default_branch}`
                        });

                        continue;
                    }

                    descriptorWithTree = findResults;
                } catch (e) {
                    this.actionReporter.addFailed({
                        name: repository.full_name,
                        reason: `${LoggerUtil.getErrorMessage(e)}`,
                        ref: this.ref ?? `heads/${repository.default_branch}`
                    });

                    continue;
                }

                let repoPath: string;

                try {
                    const theRepoPath = await this.reinstallPackageForProject(
                        repository,
                        descriptorWithTree.descriptors,
                        tmpDir,
                        versionToUse
                    );

                    // If no repo path is returned, something wrong happened and we should skip...
                    if (!theRepoPath) {
                        this.actionReporter.addSkipped({
                            name: repository.full_name,
                            reason: `Package reinstallation did not succeed`,
                            ref:
                                this.ref ?? `heads/${repository.default_branch}`
                        });

                        continue;
                    }

                    repoPath = theRepoPath;
                } catch (e) {
                    this.actionReporter.addFailed({
                        name: repository.full_name,
                        reason: `${LoggerUtil.getErrorMessage(e)}`,
                        ref: this.ref ?? `heads/${repository.default_branch}`
                    });

                    continue;
                }

                if (!this.dryRun) {
                    // Remove any file descriptors that match
                    _remove(descriptorWithTree.tree.tree, (treeItem) => {
                        const shaMatch = _find(
                            descriptorWithTree.descriptors,
                            (item) => item.sha === treeItem.sha
                        );

                        return shaMatch ? true : false;
                    });

                    try {
                        await this.useGithubUtils(
                            this.gitConfigName
                        ).uploadToRepository(
                            repoPath,
                            repository,
                            `Reinstall ${this.packageName} with version ${
                                this.packageVersion
                            } in ${PackageTypes[this.packageType]}`,
                            this.ref ?? `heads/${repository.default_branch}`,
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
                            `[${ReinstallPackageAction.CLASS_NAME}.run]`,
                            `Failed to commit changes\n`,
                            e
                        );

                        this.actionReporter.addFailed({
                            name: repository.full_name,
                            reason: `${LoggerUtil.getErrorMessage(e)}`,
                            ref:
                                this.ref ?? `heads/${repository.default_branch}`
                        });

                        continue;
                    }
                } else {
                    this.logger.info(
                        `[${ReinstallPackageAction.CLASS_NAME}.run]`,
                        `Dry run mode enabled, changes will not be commited`
                    );
                }

                this.actionReporter.addSuccessful({
                    name: repository.full_name,
                    reason: `Reinstalled ${this.packageName} successfully`,
                    ref: this.ref ?? `heads/${repository.default_branch}`
                });
            }

            this.filesystemUtil.removeDirectory(tmpDir);
        }

        this.actionReporter.completeReport();
    }

    public async reinstallPackageForProject(
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
                const content = await this.useGithubUtils(
                    this.gitConfigName
                ).getFileDescriptorContent(repository, descriptor, {
                    ref: this.ref ?? `heads/${repository.default_branch}`
                });

                descriptorWithContents.push({
                    content,
                    descriptor
                });
            }
        } catch (e) {
            this.logger.error(
                `[${ReinstallPackageAction.CLASS_NAME}.reinstallPackageForProject]`,
                `Failed to obtain file contents for descriptors\n`,
                e
            );

            // Don't throw an error because this is not an error in the execution itself
            // but rather the nature of the repository which did not meet the criteria
            // for this operation.
            return undefined;
        }

        let lockfileDescriptorAndContent: DescriptorWithContents | undefined;

        try {
            lockfileDescriptorAndContent = _find(
                descriptorWithContents,
                (item) =>
                    item.descriptor.path?.includes(
                        NpmUtil.LOCKFILE_FILE_NAME
                    ) ?? false
            );
        } catch (e) {
            this.logger.error(
                `[${ReinstallPackageAction.CLASS_NAME}.reinstallPackageForProject]`,
                `Failed to read ${NpmUtil.LOCKFILE_FILE_NAME} descriptor\n`,
                e
            );

            // Its possible that a repo doesn't have a package-lock.json
            return undefined;
        }

        let packageJsonDescriptorAndContent: DescriptorWithContents | undefined;

        try {
            packageJsonDescriptorAndContent = _find(
                descriptorWithContents,
                (item) =>
                    item.descriptor.path?.includes(
                        NpmUtil.PACKAGE_JSON_FILE_NAME
                    ) ?? false
            );
        } catch (e) {
            this.logger.error(
                `[${ReinstallPackageAction.CLASS_NAME}.reinstallPackageForProject]`,
                `Failed to read ${NpmUtil.PACKAGE_JSON_FILE_NAME} descriptor`
            );

            // Its possible that a repo doesn't have a package.json
            return undefined;
        }

        if (!lockfileDescriptorAndContent || !packageJsonDescriptorAndContent) {
            this.logger.error(
                `[${ReinstallPackageAction.CLASS_NAME}.reinstallPackageForProject]`,
                `Failed to read content for ${NpmUtil.PACKAGE_JSON_FILE_NAME} and ${NpmUtil.LOCKFILE_FILE_NAME}`
            );

            // Don't throw an error here because it is possible that a repository may not have these files...
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

            let theExistingPackageType: ReturnType<
                typeof NpmUtil.doesDependencyExist
            >['packageType'];
            let theExistingVersion: ReturnType<
                typeof NpmUtil.doesDependencyExist
            >['versionFound'];

            try {
                const result = NpmUtil.doesDependencyExist(
                    maybePackageJson,
                    this.packageName,
                    this.packageType,
                    {
                        checkAll: true
                    }
                );

                theExistingPackageType = result.packageType;
                theExistingVersion = result.versionFound;
            } catch (e) {
                if (e instanceof Error) {
                    if (
                        e.message.includes(
                            `The package ${this.packageName} was not found`
                        )
                    ) {
                        this.logger.info(
                            `[${ReinstallPackageAction.CLASS_NAME}.reinstallPackageForProject]`,
                            `The package ${this.packageName} was not found in ${
                                repository.name
                            } in ${PackageTypes[this.packageType]}`
                        );

                        return undefined;
                    }
                }

                throw e;
            }

            if (!theExistingVersion) {
                this.logger.info(
                    `[${ReinstallPackageAction.CLASS_NAME}.reinstallPackageForProject]`,
                    `The package ${this.packageName} was not found in ${
                        repository.name
                    } in ${PackageTypes[this.packageType]}`
                );

                return undefined;
            }

            if (theExistingPackageType === this.packageType) {
                this.logger.info(
                    `[${ReinstallPackageAction.CLASS_NAME}.reinstallPackageForProject]`,
                    `The package ${this.packageName} is already installed in ${
                        PackageTypes[this.packageType]
                    } for ${repository.name}`
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

            // Now we will consider any constraints and conditions that are specified before proceeding with the reinstallation
            // If no constraint or condition is given, we will assume that any version given is good and will proceed with the reinstallation
            // If provided, we will first ensure that the existing package meets the given constraints and conditions before proceeeding
            // with the reinstallation.
            if (
                !(await this.npmUtil.shouldUpdatePackageVersion(
                    this.packageName,
                    theExistingVersion,
                    this.packageUpdateConstraint,
                    this.packageUpdateCondition
                ))
            ) {
                this.logger.info(
                    `[${ReinstallPackageAction.CLASS_NAME}.run]`,
                    `The update constraint was not fulfilled, package reinstall will be skipped`
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
                    `[${ReinstallPackageAction.CLASS_NAME}.reinstallPackageForProject]`,
                    `The command ${npmCiResponse.command} failed to execute\n`,
                    npmCiResponse.response
                );

                throw new Error(
                    `The command ${npmCiResponse.command} failed to execute`
                );
            }

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
                    `[${ReinstallPackageAction.CLASS_NAME}.reinstallPackageForProject]`,
                    `The command ${uninstallExistingPackageResponse.command} failed to execute\n`,
                    uninstallExistingPackageResponse.response
                );

                throw new Error(
                    `The command ${uninstallExistingPackageResponse.command} failed to execute`
                );
            }

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
                    `[${ReinstallPackageAction.CLASS_NAME}.reinstallPackageForProject]`,
                    `The command ${installPackageResponse.command} failed to execute\n`,
                    installPackageResponse.response
                );

                throw new Error(
                    `The command ${installPackageResponse.command} failed to execute`
                );
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
                `[${ReinstallPackageAction.CLASS_NAME}.reinstallPackageForProject]`,
                `The package reinstallation for ${this.packageName} failed\n`,
                e
            );

            throw e;
        }
    }
}
