import _ from 'lodash';
import { GitOpsCommands } from '../index';
import {
    GitTreeWithFileDescriptor,
    GitHubRepository,
    GitTreeItem
} from '../utils/github.util';
import { LoggerUtil, LogLevel } from '../utils/logger.util';
import { InstallModes, NpmUtil, PackageTypes } from '../utils/npm.util';
import { GenericAction } from './generic.action';

export type UpdatePackageVersionActionOptions =
    GitOpsCommands['UpdatePackageVersion'];

export type UpdatePackageVersionActionResponse = void;

export class UpdatePackageVersionAction extends GenericAction<UpdatePackageVersionActionResponse> {
    private packageName: string;
    private packageVersion: string;
    private packageType: UpdatePackageVersionActionOptions['packageType'];
    private packageUpdateConstraint: UpdatePackageVersionActionOptions['packageUpdateConstraint'];
    private packageUpdateCondition: UpdatePackageVersionActionOptions['packageUpdateCondition'];

    constructor(options: UpdatePackageVersionActionOptions) {
        UpdatePackageVersionAction.CLASS_NAME = 'UpdatePackageVersionAction';

        super({
            githubToken: options.githubToken,
            logLevel: LogLevel[options.logLevel as keyof typeof LogLevel],
            tokenFilePath: options.tokenFilePath,
            organizations: options.organizations,
            repositoryList: options.repositoryList,
            repositories: options.repositories,
            excludeRepositories: options.excludeRepositories,
            ref: options.ref,
            command: UpdatePackageVersionAction.CLASS_NAME,
            dryRun: options.dryRun
        });

        this.packageName = options.packageName;
        this.packageVersion = options.packageVersion;
        this.packageType = options.packageType;
        this.packageUpdateConstraint = options.packageUpdateConstraint;
        this.packageUpdateCondition = options.packageUpdateCondition;
    }

    public async run(): Promise<UpdatePackageVersionActionResponse> {
        this.actionReporter.startReport(this.organizations, [
            `Updating ${this.packageName} to version ${this.packageVersion}`
        ]);

        let versionToUse: string;

        try {
            // Determine if the package version that we are trying to update to exists
            const response = await this.npmUtil.doesPackageVersionExist(
                this.packageName,
                this.packageVersion
            );

            // If no such version for the package exists, then we stop processing here
            if (!response) {
                this.logger.info(
                    `[${UpdatePackageVersionAction.CLASS_NAME}.run]`,
                    `The specified version ${this.packageVersion} does not exist for the package ${this.packageName}`
                );

                throw new Error(
                    `The specified version ${this.packageVersion} does not exist for the package ${this.packageName}`
                );
            }

            versionToUse = response;
        } catch (e) {
            this.logger.error(
                `[${UpdatePackageVersionAction.CLASS_NAME}.run]`,
                `Internal error while running the operation.\n`,
                e
            );

            this.actionReporter.addGeneralError({
                message: `${LoggerUtil.getErrorMessage(e)}`
            });

            this.actionReporter.completeReport();

            return;
        }

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
                    `[${UpdatePackageVersionAction.CLASS_NAME}.run]`,
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
                    `[${UpdatePackageVersionAction.CLASS_NAME}.run]`,
                    `Failed to create temporary directory for operation\n`,
                    e
                );

                this.actionReporter.addGeneralError({
                    message: `${LoggerUtil.getErrorMessage(e)}`
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

                let descriptorWithTree: GitTreeWithFileDescriptor;

                try {
                    const findResults =
                        await this.githubUtil.findTreeAndDescriptorForFilePath(
                            repository,
                            [
                                NpmUtil.PACKAGE_JSON_FILE_NAME,
                                NpmUtil.LOCKFILE_FILE_NAME
                            ],
                            this.ref ?? `heads/${repository.default_branch}`
                        );

                    if (findResults?.descriptors.length !== 2) {
                        this.logger.warn(
                            `[${UpdatePackageVersionAction.CLASS_NAME}.run]`,
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
                    const theRepoPath =
                        await this.updatePackageVersionForProject(
                            repository,
                            descriptorWithTree.descriptors,
                            tmpDir,
                            versionToUse
                        );

                    // If no repo path is returned, something wrong happened and we should skip...
                    if (!theRepoPath) {
                        this.actionReporter.addSkipped({
                            name: repository.full_name,
                            reason: `Package version update was not done`,
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
                            `[${UpdatePackageVersionAction.CLASS_NAME}.run]`,
                            `Failed to upload changes\n`,
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
                        `[${UpdatePackageVersionAction.CLASS_NAME}.run]`,
                        `Dry run mode enabled, changes will not be commited`
                    );
                }

                this.actionReporter.addSuccessful({
                    name: repository.full_name,
                    reason: `Updated ${this.packageName} to ${this.packageVersion} successfully`,
                    ref: this.ref ?? `heads/${repository.default_branch}`
                });
            }

            this.filesystemUtil.removeDirectory(tmpDir);
        }

        this.actionReporter.completeReport();
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
                        ref: this.ref ?? `heads/${repository.default_branch}`
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

            // Don't throw an error because this is not an error in the execution itself
            // but rather the nature of the repository which did not meet the criteria
            // for this operation.
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

            // Its possible that a repo doesn't have a package-lock.json
            return undefined;
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

            // Its possible that a repo doesn't have a package.json
            return undefined;
        }

        if (!lockfileDescriptorAndContent || !packageJsonDescriptorAndContent) {
            this.logger.error(
                `[${UpdatePackageVersionAction.CLASS_NAME}.updatePackageVersionForProject]`,
                `Failed to resolve content for ${NpmUtil.PACKAGE_JSON_FILE_NAME} and ${NpmUtil.LOCKFILE_FILE_NAME}`
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

                theExistingVersion = result.versionFound;
            } catch (e) {
                if (e instanceof Error) {
                    if (
                        e.message.includes(
                            `The package ${this.packageName} was not found`
                        )
                    ) {
                        this.logger.info(
                            `[${UpdatePackageVersionAction.CLASS_NAME}.reinstallPackageForProject]`,
                            `The package ${this.packageName} was not found in ${repository.name}`
                        );

                        return undefined;
                    }
                }

                throw e;
            }

            if (!theExistingVersion) {
                this.logger.info(
                    `[${UpdatePackageVersionAction.CLASS_NAME}.updatePackageVersionForProject]`,
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
                    `The update constraint was not fulfilled, update will be skipped`
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

                throw new Error(
                    `The command ${npmCiResponse.command} failed to execute`
                );
            }

            const updatePackageResponse = await this.processorUtil.spawnProcess(
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

            if (updatePackageResponse.code !== 0) {
                this.logger.error(
                    `[${UpdatePackageVersionAction.CLASS_NAME}.updatePackageVersionForProject]`,
                    `The command ${updatePackageResponse.command} failed to execute\n`,
                    updatePackageResponse.response
                );

                throw new Error(
                    `The command ${updatePackageResponse.command} failed to execute`
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
                `[${UpdatePackageVersionAction.CLASS_NAME}.updatePackageVersionForProject]`,
                `The package update for ${this.packageName} failed\n`,
                e
            );

            throw e;
        }
    }
}
