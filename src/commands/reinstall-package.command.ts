import { Command } from 'commander';
import { ReinstallPackageAction } from '../actions/reinstall-package.action';
import { GitOpsCommands } from '../index';
import {
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
    packageVersionOption,
    dryRunOption,
    gitConfigNameOption
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
-c, --git-config-name default
-n PACKAGE_NAME
-v SEMVER 
[   
    -l ERROR|WARN|INFO|DEBUG 
    -f, --ref GIT_REF 
    -r RegExp 
    -y, --package-type s|o|d
    -i RepositoryName, ..., n
    -e RepositoryName, ..., n
    --package-update-constraint SEMVER 
    --package-update-condition lte|lt|gte|gt|eq 
    --dry-run
]

Examples:

This command will reinstall the package "aws-cdk" in all repositories for the GitHub organization named "my-org" in "devDependencies" with the version "2.2.0" IF the existing version of "aws-cdk" in each scanned repository has a version that is greater or equal to "2.0.0". The operation will use the default log level, INFO. The operation will run on the default branch of each repository scanned.

npx gitops reinstall-package
  -o my-org
  -n "aws-cdk"
  -v "2.2.0"
  -y d
  --package-update-constraint "2.0.0"
  --package-update-condition gte

This command will reinstall the package "fancy-deploy" in the repository "fancy-login-user" in the GitHub organization named "my-org" in "devDependencies" (if it exists) with the latest version IF the existing version of "fancy-deploy" in the scanned repository has a version that is less than or equal to "1.9.0". The operation will run with the log level of DEBUG. The operation will run on the "dev" branch of each repository scanned.

npx gitops reinstall-package
  -o my-org
  -l DEBUG
  -r "fancy-login-user"
  -n "fancy-deploy"
  -f "heads/dev"
  -v "latest"
  -y d
  --package-update-constraint "1.9.0"
  --package-update-condition lte

This command will reinstall the package "webpack" in all repositories in the GitHub organization named "my-org" (if it exists) in "optionalDependencies" to the latest version. The operation will run using the default level and default branch of the repository scanned.

npx gitops reinstall-package
  -o my-org
  -n "webpack"
  -v "latest"
  -y o
`
        )
        .addOption(dryRunOption)
        .addOption(gitConfigNameOption)
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
            try {
                const action = new ReinstallPackageAction(options);
                await action.run();
            } catch (e) {
                program.help({ error: true });
            }
        });
};
