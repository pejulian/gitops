import { Command } from 'commander';
import { createCommands } from './commands';

export const MODULE_NAME = process.env.MODULE_NAME ?? 'gitops';
export const MODULE_VERSION = process.env.MODULE_VERSION ?? 'localhost';

export type GitOpsCommands = {
    Common: Readonly<{
        organizations: Array<string>;
        githubToken?: string;
        tokenFilePath?: string;
        logLevel: string;
        ref?: string;
        repositories?: string;
        repositoryList?: Array<string>;
        excludeRepositories?: Array<string>;
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
