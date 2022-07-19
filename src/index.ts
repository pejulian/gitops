import { Command, Option } from 'commander';
import { LogLevel } from './utils/logger.util';
import { RenameFileAction } from './actions/rename-file.action';
import { UpdatePackageVersionAction } from './actions/update-package-version.action';

export type GitToolkitCommands = {
    Common: Readonly<{
        organizations: Array<string>;
        githubToken?: string;
        tokenFilePath?: string;
        logLevel: string;
        ref?: string;
    }>;
    RenameFileAction: Readonly<{
        targetFilePath: string;
        newFileName: string;
        repositories?: string;
    }> &
        GitToolkitCommands['Common'];
    UpdatePackageVersion: Readonly<{
        packageName: string;
        packageVersion: string;
        packageType: 'd' | 's' | 'o';
        packageUpdateConstraint?: string;
        packageUpdateCondition?: 'gte' | 'gt' | 'eq' | 'lte' | 'lt';
        repositories?: string;
    }> &
        GitToolkitCommands['Common'];
    EnsureDeployability: Readonly<{
        runTest?: boolean;
        runBuild?: boolean;
        mandatoryFiles?: Array<string>;
    }> &
        GitToolkitCommands['Common'];
};

const program = new Command();

program
    .name(process.env.MODULE_NAME ?? 'gitops')
    .summary(process.env.MODULE_DESCRIPTION ?? 'gitops')
    .version(process.env.MODULE_VERSION ?? 'localhost')
    .showHelpAfterError(true);

const tokenFilePathOption = new Option(
    '-p, --token-file-path <value>',
    "[OPTIONAL] A path to the file in your user's home directory where the GitHub Personal Access Token is stored. Defaults to $HOME/c9-cli-token.txt"
);

const githubTokenOption = new Option(
    '-t, --github-token <value>',
    '[OPTIONAL] A GitHub Personal Access Token that will be used when running Git commands against the GitHub service. Will override the token file path option if defined.'
);

const organizationsOption = new Option(
    '-o, --organizations [value...]',
    'A list of Github organizations to search for repositories. You may specify one or more organizations separated by a whitespace character.'
).makeOptionMandatory(true);

const logLevelOption = new Option(
    '-l, --log-level <value>',
    '[OPTIONAL] The log level to use while executing commands. Choose a higher log severity to view more logs in the console when running commands.'
)
    .choices(
        Object.values(LogLevel).filter(
            (value) => typeof value === 'string'
        ) as string[]
    )
    .default('INFO');

const refOption = new Option(
    '-f, --ref <value>',
    '[OPTIONAL] A specific reference of the repository to narrow down on. If specifying a branch, the format must be `heads/branch_name`. If specifying a tag, the format must be `tags/tag_name`. If not supplied, most commands will fallback to use the default branch of the repository.'
);

const repositoriesOption = new Option(
    '-r, --repositories <value>',
    'A regex string to match repositories in the organization to apply the action on.'
);

const targetFilePath = new Option(
    '--target-file-path <value>',
    'The path to the filename that should be renamed'
).makeOptionMandatory(true);

const newFileNameOption = new Option(
    '--new-file-name <value>',
    'The new file name to replace the old filename with'
).makeOptionMandatory(true);

const packageNameOption = new Option(
    `-n, --package-name <value>`,
    `The name of the NPM package to search for in package.json (for example @types/jest)`
).makeOptionMandatory(true);

const packageVersionOption = new Option(
    `-v, --package-version <value>`,
    `The version of the NPM package to update. This value must be a valid semver syntax or an existing NPM distribution tag like "latest", "beta", "canary" etc. Run npm view <package_name> to view the versions and distribution tags that are available for the project you are trying to update.`
).makeOptionMandatory(true);

const packageTypeOption = new Option(
    `-y, --package-type <value>`,
    `[OPTIONAL] The type of dependency. Specify "s" for a normal dependency, "d" for devDependencies or "o" for optionalDependencies`
)
    .choices(['s', 'd', 'o'])
    .default('s');

const packageUpdateConstraint = new Option(
    `--package-update-constraint <value>`,
    `[OPTIONAL] This flag applies checks to the CURRENT VERSION OF THE PACKAGE INSTALLED. A valid semver string (e.g. 2.x.x) or distribution tag (e.g. latest, beta) to determines if the CURRENT PACKAGE VERSION meets the criteria to be updated (only works if an update condition has been specified via the --package-update-constraint flag)`
);

const packageUpdateCondition = new Option(
    `--package-update-condition <value>`,
    `[OPTIONAL] This flag applies checks to the CURRENT VERSION OF THE PACKAGE INSTALLED. Apply a package update condition on the CURRENT PACKAGE VERSION to determine if it satisfies the constraint supplied in --package-update-constraint`
).choices(['lt', 'lte', 'gt', 'gte', 'eq']);

program
    .command('rename-file')
    .summary(
        'Rename a file identified by its file path in one, many or all repositories for a given Git organization.'
    )
    .usage(
        `
Rename a file identified by its file path in one, many or all repositories for a given Git organization.

-o ORGANIZATIONS,..., n  
--target-file-path path/to/file/in/repo/file.extension 
--new-file-name newFileName.extension 
[
    -p GITBUB_TOKEN_FILE_PATH 
    -t GITHUB_TOKEN 
    -l ERROR|WARN|INFO|DEBUG 
    -f GIT_REF 
    -r RegExp 
]

Examples:

Run a rename operation across ALL repositories in the Git organization "c9" where the the file at path "scripts/topdanmark-webplatform-prod-01.json" will be renamed to "scripts/topdanmark-webplatform-prod.json". All other settings will use defaults which are log level will be INFO and the branch used will be the default branch of the repository.

npx gitops rename-file
    -o c9
    --target-file-path scripts/topdanmark-webplatform-prod-01.json
    --new-file-name topdanmark-webplatform-prod.json

Run a rename operation for just one repository in the "ragnarok" Git organization called "assistant-service-api" where the the file at path "scripts/topdanmark-webplatform-prod-01.json" will be renamed to "scripts/topdanmark-webplatform-prod.json". Default settings are overriden where the operation will run with a DEBUG log level and the operation will run only on the "development" branch of each repository, if it exists.

npx gitops rename-file
    -o ragnarok
    -l DEBUG
    -f heads/development
    -t abc123
    -r assistant-service-api
    --target-file-path scripts/topdanmark-webplatform-prod-01.json
    --new-file-name topdanmark-webplatform-prod.json
        `
    )
    .addOption(tokenFilePathOption)
    .addOption(githubTokenOption)
    .addOption(logLevelOption)
    .addOption(refOption)
    .addOption(organizationsOption)
    .addOption(repositoriesOption)
    .addOption(targetFilePath)
    .addOption(newFileNameOption)
    .action(async (options: GitToolkitCommands['RenameFileAction']) => {
        const action = new RenameFileAction(options);
        await action.run();
    });

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
    .addOption(packageNameOption)
    .addOption(packageVersionOption)
    .addOption(packageTypeOption)
    .addOption(packageUpdateCondition)
    .addOption(packageUpdateConstraint)
    .action(async (options: GitToolkitCommands['UpdatePackageVersion']) => {
        const action = new UpdatePackageVersionAction(options);
        await action.run();
    });

program.parse(process.argv);
