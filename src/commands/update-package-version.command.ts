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
    packageVersionOption,
    dryRunOption,
    gitConfigNameOption
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
-c, --git-config-name default
-n PACKAGE_NAME
-v SEMVER 
[  
    -l ERROR|WARN|INFO|DEBUG 
    -f, --ref GIT_REF 
    -y, --package-type s|o|d
    -r RegExp 
    -i RepositoryName, ..., n
    -e RepositoryName, ..., n
    --package-update-constraint SEMVER 
    --package-update-condition lte|lt|gte|gt|eq 
    --dry-run
]

Examples:

This command will update the development dependency "aws-cdk" in all repositories in the GitHub organization named "my-org" to the version "2.2.0" IF the existing version of "aws-cdk" in each scanned repository has a version that is greater or equal to "2.0.0". The operation will use the default log level, INFO. The operation will run on the default branch of each repository scanned.

npx gitops update-package-version
  -o my-org
  -n "aws-cdk"
  -v "2.2.0"
  -y d
  --package-update-constraint "2.0.0"
  --package-update-condition gte

This command will update the development dependency "fancy-deploy" in the repository "fancy-login-user" in the GitHub organization named "my-org" (if it exists) to the latest version IF the existing version of "fancy-deploy" in the scanned repository has a version that is less than or equal to "1.9.0". The operation will run with the log level of DEBUG. The operation will run on the "dev" branch of each repository scanned.

npx gitops update-package-version
  -o my-org
  -l DEBUG
  -r "fancy-login-user"
  -n "fancy-deploy"
  -f "heads/dev"
  -v "latest"
  -y d
  --package-update-constraint "1.9.0"
  --package-update-condition lte

This command will update the development dependency "webpack" in all repositories in the GitHub organization named "my-org" (if it exists) to the latest version. The operation will run using the default level and default branch of the repository scanned.

npx gitops update-package-version
  -o my-org
  -n "webpack"
  -v "latest"
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
        .addOption(packageVersionOption)
        .addOption(packageTypeOption)
        .addOption(packageUpdateConditionOption)
        .addOption(packageUpdateConstraintOption)
        .action(async (options: GitOpsCommands['UpdatePackageVersion']) => {
            try {
                const action = new UpdatePackageVersionAction(options);
                await action.run();
            } catch (e) {
                program.help({ error: true });
            }
        });
};
