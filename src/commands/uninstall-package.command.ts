import { Command } from 'commander';
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
    packageUpdateConstraintOption
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

This command will uninstall the development dependency "c9-cdk-nodejs" in all repositories in the GitHub organization named "c9" IF the existing version of "c9-cdk-nodejs" in each scanned repository has a version that is greater or equal to "2.0.0". The operation will use the default log level, INFO. The operation will run on the default branch of each repository scanned.

npx gitops uninstall-package 
  -o c9
  -n "c9-cdk-nodejs"
  -y d
  --package-update-constraint "2.0.0"
  --package-update-condition gte

This command will uninstall the development dependency "c9-deploy" in the repository "c9-login-refresh" in the GitHub organization named "c9" IF the existing version of "c9-deploy" in the scanned repository has a version that is less than or equal to "1.9.0". The operation will run with the log level of DEBUG. The operation will run on the "dev" branch of each repository scanned.The operation will use the user supplied git access token "abc123".

npx gitops uninstall-package 
  -o c9
  -l DEBUG
  -r "c9-login-refresh"
  -n "c9-deploy"
  -f "heads/dev"
  -y d
  -t abc123
  --package-update-constraint "1.9.0"
  --package-update-condition lte

This command will uninstall the development dependency "webpack" in all repositories in the GitHub organization named "c9". The operation will run using the default level and default branch of the repository scanned.

npx gitops uninstall-package
  -o c9
  -n "webpack"
  -t d
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
        .addOption(packageTypeOption)
        .addOption(packageUpdateConditionOption)
        .addOption(packageUpdateConstraintOption)
        .action(async (options: GitOpsCommands['UninstallPackage']) => {
            const action = new UninstallPackageAction(options);
            await action.run();
        });
};
