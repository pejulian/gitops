import { Command } from 'commander';
import { InstallPackageAction } from '@actions/install-package.action';
import { GitOpsCommands } from '@root';
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
    packageVersionOption,
    dryRunOption
} from '@commands/options';

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
    --dry-run
]

Examples:

This command will install the package "aws-cdk" in all repositories for the GitHub organization named "faz" in "devDependencies" with the version "2.40.0". The operation will use the default log level, INFO. The operation will run on the default branch of each repository scanned.

npx gitops install-package
  -o faz
  -n "aws-cdk"
  -v "2.40.0"
  -y d

This command will install the package "fancy-deploy" in the repository "fancy-login-user" in the GitHub organization named "my-org" in "devDependencies" with the latest version. The operation will run with the log level of DEBUG. The operation will run on the "dev" branch of each repository scanned.

npx gitops install-package
  -o my-org
  -l DEBUG
  -r "fancy-login-user"
  -n "fancy-deploy"
  -f "heads/dev"
  -v "latest"
  -t d

This command will install the package "webpack" in all repositories in the GitHub organization named "my-org" in "optionalDependencies" to the latest version. The operation will run using the default level and default branch of the repository scanned.

npx gitops install-package
  -o my-org
  -n "webpack"
  -v "latest"
  -t o
`
        )
        .addOption(dryRunOption)
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
            try {
                const action = new InstallPackageAction(options);
                await action.run();
            } catch (e) {
                program.help({ error: true });
            }
        });
};
