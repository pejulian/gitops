import { Command } from 'commander';
import { createCommands } from './commands';

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
    RenameFileAction: Readonly<{
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
};

const program = new Command();

program
    .name(process.env.MODULE_NAME ?? 'gitops')
    .summary(process.env.MODULE_DESCRIPTION ?? 'gitops')
    .version(process.env.MODULE_VERSION ?? 'localhost')
    .showHelpAfterError(true);

createCommands(program);

program.parse(process.argv);
