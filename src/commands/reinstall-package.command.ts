import { Command } from 'commander';
import { ReinstallPackageAction } from '../actions/reinstall-package.action';
import { GitOpsCommands } from '../index';
import {
    tokenFilePathOption,
    githubTokenOption,
    logLevelOption,
    refOption,
    organizationsOption,
    repositoriesOption,
    repositoryListOption,
    excludeRepositoriesOption,
    packageNameOption,
    packageTypeOption,
    packageUpdateConditionOption,
    packageUpdateConstraintOption,
    packageVersionOption
} from './options';

export const createCommand = (program: Command) => {
    program
        .command('reinstall-package')
        .summary(
            `Reinstall an existing package in the effected repositories for the given organizations`
        )
        .usage(
            `
Reinstall an existing package in the effected repositories for the given organizations.

-o ORGANIZATIONS,..., n 
-n PACKAGE_NAME
-v SEMVER 
[   -p GITBUB_TOKEN_FILE_PATH 
    -t GITHUB_TOKEN 
    -l ERROR|WARN|INFO|DEBUG 
    -f GIT_REF 
    -r RegExp 
    -i RepositoryName, ..., n
    -e RepositoryName, ..., n
    --package-update-constraint SEMVER 
    --package-update-condition lte|lt|gte|gt|eq 
]

Examples:

This command will reinstall the package "c9-cdk-nodejs" in all repositories for the GitHub organization named "c9" in "devDependencies" with the version "2.2.0" IF the existing version of "c9-cdk-nodejs" in each scanned repository has a version that is greater or equal to "2.0.0". The operation will use the default log level, INFO. The operation will run on the default branch of each repository scanned.

npx gitops reinstall-package
  -o c9
  -n "c9-cdk-nodejs"
  -v "2.2.0"
  -y d
  --package-update-constraint "2.0.0"
  --package-update-condition gte

This command will reinstall the package "c9-deploy" in the repository "c9-login-refresh" in the GitHub organization named "c9" in "devDependencies" (if it exists) with the latest version IF the existing version of "c9-deploy" in the scanned repository has a version that is less than or equal to "1.9.0". The operation will run with the log level of DEBUG. The operation will run on the "dev" branch of each repository scanned.

npx gitops reinstall-package
  -o c9
  -l DEBUG
  -r "c9-login-refresh"
  -n "c9-deploy"
  -f "heads/dev"
  -v "latest"
  -t d
  --package-update-constraint "1.9.0"
  --package-update-condition lte

This command will reinstall the package "webpack" in all repositories in the GitHub organization named "c9" (if it exists) in "optionalDependencies" to the latest version. The operation will run using the default level and default branch of the repository scanned.

npx gitops reinstall-package
  -o c9
  -n "webpack"
  -v "latest"
  -t o
`
        )
        .addOption(tokenFilePathOption)
        .addOption(githubTokenOption)
        .addOption(logLevelOption)
        .addOption(refOption)
        .addOption(organizationsOption)
        .addOption(repositoriesOption)
        .addOption(repositoryListOption)
        .addOption(excludeRepositoriesOption)
        .addOption(packageNameOption)
        .addOption(packageVersionOption)
        .addOption(packageTypeOption)
        .addOption(packageUpdateConditionOption)
        .addOption(packageUpdateConstraintOption)
        .action(async (options: GitOpsCommands['ReinstallPackage']) => {
            const action = new ReinstallPackageAction(options);
            await action.run();
        });
};
