import { Command } from 'commander';
import { InstallPackageAction } from '../actions/install-package.action';
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
    packageVersionOption
} from './options';

export const createCommand = (program: Command) => {
    program
        .command('install-package')
        .summary(
            `Install a new package in the effected repositories for the given organizations`
        )
        .usage(
            `
Install a new package in the effected repositories for the given organizations.

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
]

Examples:

This command will install the package "c9-cdk-nodejs" in all repositories for the GitHub organization named "c9" in "devDependencies" with the version "2.2.0". The operation will use the default log level, INFO. The operation will run on the default branch of each repository scanned.

npx gitops install-package
  -o c9
  -n "c9-cdk-nodejs"
  -v "2.2.0"
  -y d

This command will install the package "c9-deploy" in the repository "c9-login-refresh" in the GitHub organization named "c9" in "devDependencies" with the latest version. The operation will run with the log level of DEBUG. The operation will run on the "dev" branch of each repository scanned.

npx gitops install-package
  -o c9
  -l DEBUG
  -r "c9-login-refresh"
  -n "c9-deploy"
  -f "heads/dev"
  -v "latest"
  -t d

This command will install the package "webpack" in all repositories in the GitHub organization named "c9" in "optionalDependencies" to the latest version. The operation will run using the default level and default branch of the repository scanned.

npx gitops install-package
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
        .action(async (options: GitOpsCommands['InstallPackage']) => {
            const action = new InstallPackageAction(options);
            await action.run();
        });
};
