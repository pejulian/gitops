import { Command } from 'commander';
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
    dryRunOption,
    gitConfigNameOption
} from './options';
import { UninstallPackageAction } from '../actions/uninstall-package.action';

export const createCommand = (program: Command) => {
    program
        .command('uninstall-package')
        .summary(
            `Uninstalls an existing package from repositories in the given Git organizations`
        )
        .usage(
            `
Uninstalls an existing package from repositories in the given Git organizations.

-o ORGANIZATIONS,..., n 
-n PACKAGE_NAME
-c, --git-config-name default
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

This command will uninstall the development dependency "aws-cdk" in all repositories in the GitHub organization named "my-org" IF the existing version of "aws-cdk" in each scanned repository has a version that is greater or equal to "2.0.0". The operation will use the default log level, INFO. The operation will run on the default branch of each repository scanned.

npx gitops uninstall-package 
  -o my-org
  -n "aws-cdk"
  -y d
  --package-update-constraint "2.0.0"
  --package-update-condition gte

This command will uninstall the development dependency "fancy-deploy" in the repository "fancy-login-user" in the GitHub organization named "my-org" IF the existing version of "fancy-deploy" in the scanned repository has a version that is less than or equal to "1.9.0". The operation will run with the log level of DEBUG. The operation will run on the "dev" branch of each repository scanned.

npx gitops uninstall-package 
  -o my-org
  -l DEBUG
  -r "fancy-login-user"
  -n "fancy-deploy"
  -f "heads/dev"
  -y d
  --package-update-constraint "1.9.0"
  --package-update-condition lte

This command will uninstall the development dependency "webpack" in all repositories in the GitHub organization named "my-org". The operation will run using the default level and default branch of the repository scanned.

npx gitops uninstall-package
  -o my-org
  -n "webpack"
  -y d
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
        .addOption(packageTypeOption)
        .addOption(packageUpdateConditionOption)
        .addOption(packageUpdateConstraintOption)
        .action(async (options: GitOpsCommands['UninstallPackage']) => {
            try {
                const action = new UninstallPackageAction(options);
                await action.run();
            } catch (e) {
                program.help({ error: true });
            }
        });
};
