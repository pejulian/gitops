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
    packageUpdateConstraintOption,
    packageVersionOption
} from './options';
import { UpdatePackageVersionAction } from '../actions/update-package-version.action';

export const createCommand = (program: Command) => {
    program
        .command('update-package-version')
        .summary(
            `Updates the version of an existing npm package in package.json for all affected repositories in the given organizations`
        )
        .usage(
            `
Updates the version of an existing npm package in package.json for all affected repositories in the given organizations.

-o ORGANIZATIONS,..., n 
-n PACKAGE_NAME
-v SEMVER 
[   -p GITBUB_TOKEN_FILE_PATH 
    -t GITHUB_TOKEN 
    -l ERROR|WARN|INFO|DEBUG 
    -f GIT_REF 
    -r RegExp 
    -i RepositoryName, ..., n
    --package-update-constraint SEMVER 
    --package-update-condition lte|lt|gte|gt|eq 
]

Examples:

This command will update the development dependency "c9-cdk-nodejs" in all repositories in the GitHub organization named "c9" to the version "2.2.0" IF the existing version of "c9-cdk-nodejs" in each scanned repository has a version that is greater or equal to "2.0.0". The operation will use the default log level, INFO. The operation will run on the default branch of each repository scanned.

npx gitops update-package-version
  -o c9
  -n "c9-cdk-nodejs"
  -v "2.2.0"
  -y d
  --package-update-constraint "2.0.0"
  --package-update-condition gte

This command will update the development dependency "c9-deploy" in the repository "c9-login-refresh" in the GitHub organization named "c9" (if it exists) to the latest version IF the existing version of "c9-deploy" in the scanned repository has a version that is less than or equal to "1.9.0". The operation will run with the log level of DEBUG. The operation will run on the "dev" branch of each repository scanned.

npx gitops update-package-version
  -o c9
  -l DEBUG
  -r "c9-login-refresh"
  -n "c9-deploy"
  -f "heads/dev"
  -v "latest"
  -t d
  --package-update-constraint "1.9.0"
  --package-update-condition lte

This command will update the development dependency "webpack" in all repositories in the GitHub organization named "c9" (if it exists) to the latest version. The operation will run using the default level and default branch of the repository scanned.

npx gitops update-package-version
  -o c9
  -n "webpack"
  -v "latest"
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
        .addOption(packageVersionOption)
        .addOption(packageTypeOption)
        .addOption(packageUpdateConditionOption)
        .addOption(packageUpdateConstraintOption)
        .action(async (options: GitOpsCommands['UpdatePackageVersion']) => {
            const action = new UpdatePackageVersionAction(options);
            await action.run();
        });
};