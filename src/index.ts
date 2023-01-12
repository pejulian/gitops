import { Command } from 'commander';
import { createCommands } from './commands';

export const MODULE_NAME = process.env.MODULE_NAME ?? 'gitops';
export const MODULE_VERSION = process.env.MODULE_VERSION ?? 'localhost';

export type GitOpsCommands = {
    Common: Readonly<{
        /**
         * The list of organizations to work on
         */
        organizations: Array<string>;
        /**
         * The log level to apply when making log statements
         */
        logLevel: string;
        /**
         * The git reference to operate on for each repository
         */
        ref?: string;
        /**
         * A regex of repos to consider for operations
         */
        repositories?: string;
        /**
         * A list of repositories to consider (overrides repositories)
         */
        repositoryList?: Array<string>;
        /**
         * A list of repositories to be excluded from consideration
         */
        excludeRepositories?: Array<string>;
        /**
         * When true, perform the action without committing changes to Git
         */
        dryRun: boolean;
        /**
         * The named of the git config to use.
         * This name (and corresponding config) should exist in .gitopsrc.json
         */
        gitConfigName: string;
    }>;
    CommonPackageConstraints: Readonly<{
        packageUpdateConstraint?: string;
        packageUpdateCondition?: 'gte' | 'gt' | 'eq' | 'lte' | 'lt';
    }>;
    RenameFile: Readonly<{
        targetFilePath: string;
        newFileName: string;
    }> &
        GitOpsCommands['Common'];
    UpdatePackageVersion: Readonly<{
        packageName: string;
        packageVersion: string;
        packageType: 'd' | 's' | 'o';
    }> &
        GitOpsCommands['CommonPackageConstraints'] &
        GitOpsCommands['Common'];
    ReinstallPackage: Readonly<{
        packageName: string;
        packageVersion: string;
        packageType: 'd' | 's' | 'o';
    }> &
        GitOpsCommands['CommonPackageConstraints'] &
        GitOpsCommands['Common'];
    UninstallPackage: Readonly<{
        packageName: string;
        packageType: 'd' | 's' | 'o';
    }> &
        GitOpsCommands['CommonPackageConstraints'] &
        GitOpsCommands['Common'];
    InstallPackage: Readonly<{
        packageName: string;
        packageVersion: string;
        packageType: 'd' | 's' | 'o';
    }> &
        GitOpsCommands['Common'];
    DownloadRepository: Readonly<{
        skipExisting?: boolean;
        overwriteExisting?: boolean;
        extractDownload?: boolean;
    }> &
        GitOpsCommands['Common'];
    FindAndReplace: Readonly<{
        searchFor: string;
        searchForFlags: string;
        replaceWith: string;
        filesToMatch: Array<string>;
    }> &
        GitOpsCommands['Common'];
    RemovePackageJsonScript: Readonly<{
        scriptKey: string;
    }> &
        GitOpsCommands['Common'];
    AddPackageJsonScript: Readonly<{
        scriptKey: string;
        scriptValue: string;
        overrideExistingScriptKey: boolean;
    }> &
        GitOpsCommands['Common'];
    AddGitRemote: GitOpsCommands['Common'];
};

console.log(`\n${MODULE_NAME} ${MODULE_VERSION}\n`);

const program = new Command();

program
    .name(MODULE_NAME)
    .summary(process.env.MODULE_DESCRIPTION ?? MODULE_NAME)
    .description(
        `
        This module makes it easier for one to run common operations on Git repositories at scale.
        The target use case of this module is to simplify maintenance tasks by reducing the need for carrying out repetitive steps on multiple repositories.
        This tool also offers relevant methods to help users scope out the list of repositories that will be affected by batch operations.

        NOTE:
        This module uses the capabilities YOUR LOCAL MACHINE to make changes to repositories.
        Therefore, it is required that you have the necessary tools installed on your machine before running any of the commands offered by this module.

        A working node and npm setup is required so that "npm ci" and "npm run build" can be executed on each project that will be affected by changes.
    `
    )
    .version(MODULE_VERSION)
    .showHelpAfterError(true)
    .allowExcessArguments(false)
    .allowUnknownOption(false);

createCommands(program);

program.parse(process.argv);
