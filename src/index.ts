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
         * The raw github personal access token value to use.
         * Will take precedence over `tokenFilePath` if defined.
         */
        githubToken?: string;
        /**
         * The path to the github personal access token file that has been stored
         * somewhere in the users' home directory.
         *
         * NOTE: The file must reside in the root or subdirectory OF THE USERS HOME DIRECTORY
         */
        tokenFilePath?: string;
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
    ScrapeRepository: GitOpsCommands['Common'];
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
};

console.log(`\n${MODULE_NAME} v${MODULE_VERSION}\n`);

const program = new Command();

program
    .name(MODULE_NAME)
    .summary(process.env.MODULE_DESCRIPTION ?? MODULE_NAME)
    .version(MODULE_VERSION)
    .showHelpAfterError(true);

createCommands(program);

program.parse(process.argv);
