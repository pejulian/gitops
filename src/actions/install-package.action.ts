import { GitOpsCommands } from '../index';
import {
    GitHubRepository,
    GitTreeItem,
    GitTreeWithFileDescriptor
} from '../utils/github.util';
import { LoggerUtil, LogLevel } from '../utils/logger.util';
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
            ref: options.ref,
            command: InstallPackageAction.CLASS_NAME,
            dryRun: options.dryRun
        });

        this.packageName = options.packageName;
        this.packageVersion = options.packageVersion;
        this.packageType = options.packageType;
    }

    public async run(): Promise<InstallPackageActionResponse> {
        this.actionReporter.startReport(this.organizations, [
            `Installing ${this.packageName} with version ${this.packageVersion}`
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
                    `[${InstallPackageAction.CLASS_NAME}.run]`,
                    `The specified version ${this.packageVersion} does not exist for the package ${this.packageName}`
                );

                throw new Error(
                    `The specified version ${this.packageVersion} does not exist for the package ${this.packageName}`
                );
            }

            versionToUse = response;
        } catch (e) {
            this.logger.error(
                `[${InstallPackageAction.CLASS_NAME}.run]`,
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
                    `[${InstallPackageAction.CLASS_NAME}.run]`,
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
                    `[${InstallPackageAction.CLASS_NAME}.run]`,
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
                            `[${InstallPackageAction.CLASS_NAME}.run]`,
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
                    const theRepoPath = await this.installPackageForProject(
                        repository,
                        descriptorWithTree.descriptors,
                        tmpDir,
                        versionToUse
                    );

                    // If no repo path is returned, something wrong happened and we should skip...
                    if (!theRepoPath) {
                        this.actionReporter.addSkipped({
                            name: repository.full_name,
                            reason: `Package installation was not done`,
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
                            `Install ${this.packageName} with version ${
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
                            `[${InstallPackageAction.CLASS_NAME}.run]`,
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
                        `[${InstallPackageAction.CLASS_NAME}.run]`,
                        `Dry run mode enabled, changes will not be commited`
                    );
                }

                this.actionReporter.addSuccessful({
                    name: repository.full_name,
                    reason: `Installed ${this.packageName} successfully`,
                    ref: this.ref ?? `heads/${repository.default_branch}`
                });
            }

            this.filesystemUtil.removeDirectory(tmpDir);
        }

        this.actionReporter.completeReport();
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
                `[${InstallPackageAction.CLASS_NAME}.installPackageForProject]`,
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
                `[${InstallPackageAction.CLASS_NAME}.installPackageForProject]`,
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
                `[${InstallPackageAction.CLASS_NAME}.installPackageForProject]`,
                `Failed to read ${NpmUtil.PACKAGE_JSON_FILE_NAME} descriptor`
            );

            // Its possible that a repo doesn't have a package.json
            return undefined;
        }

        if (!lockfileDescriptorAndContent || !packageJsonDescriptorAndContent) {
            this.logger.error(
                `[${InstallPackageAction.CLASS_NAME}.installPackageForProject]`,
                `Failed to resolve content for ${NpmUtil.PACKAGE_JSON_FILE_NAME} and ${NpmUtil.LOCKFILE_FILE_NAME}`
            );

            // It's possible that a repo doesn't have a package-lock.json or package.json file
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
                `[${InstallPackageAction.CLASS_NAME}.installPackageForProject]`,
                `Installation of ${this.packageName} failed\n`,
                e
            );

            throw e;
        }
    }
}
