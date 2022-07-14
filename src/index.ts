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
        repositories?: string;
    }> &
        GitToolkitCommands['Common'];
};

const program = new Command();

program
    .name(process.env.MODULE_NAME ?? 'git-toolkit')
    .version(process.env.MODULE_VERSION ?? 'localhost')
    .showHelpAfterError(true);

const tokenFilePathOption = new Option(
    '-p, --token-file-path <value>',
    "[OPTIONAL] A path to the file in your user's home directory where the GitHub Personal Access Token is stored. Defaults to $HOME/c9-cli-token.txt"
);

const githubTokenOption = new Option(
    '-t, --github-token <value>',
    '[OPTIONAL] Your GitHub Personal Access Token that will be used to when running Git commands against our GitHub service. Will override the token file path option if defined.'
);

const organizationsOption = new Option(
    '-o, --organizations [value...]',
    'A list of Github organizations to search for repositories. You may specify one or more organizations separated by a whitespace character.'
).makeOptionMandatory(true);

const logLevelOption = new Option(
    '-l, --log-level <value>',
    '[OPTIONAL] The log level to use while executing commands.'
)
    .choices(
        Object.values(LogLevel).filter(
            (value) => typeof value === 'string'
        ) as string[]
    )
    .default('INFO');

const refOption = new Option(
    '-f, --ref <value>',
    '[OPTIONAL] A specific reference of the repository to narrow down on. If specifying a branch, the format must be `heads/branch_name`. If specifying a tag, the format must be `tags/tag_name`.'
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
    `--package-name <value>`,
    `The name of the NPM package to search for in package.json`
).makeOptionMandatory(true);

const packageVersionOption = new Option(
    `--package-version <value>`,
    `The version of the NPM package to update. This value must be a valid semver syntax or an existing version tag like "latest", "beta"`
).makeOptionMandatory(true);

const packageTypeOption = new Option(
    `--package-type <value>`,
    `The type of dependency. Specify "s" for a normal dependency, "d" for devDependencies or "o" for optionalDependencies`
)
    .choices(['s', 'd', 'o'])
    .default('s');

program
    .command('rename-file')
    .usage(
        `
-o ORGANIZATIONS,..., n [-p GITBUB_TOKEN_FILE_PATH -t GITHUB_TOKEN -l ERROR|WARN|INFO|DEBUG -f GIT_REF -r REPOSITORIES, ..., n | RegExp ]

Example:
npx github-toolkit@latest -o c9 --target-file-path scripts/topdanmark-webplatform-prod-01.json --new-file-name scripts/topdanmark-webplatform-prod.json
        `
    )
    .summary(
        'Rename a file identified by its file path in one, many or all repositories for a given Git organization'
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
    .usage(``)
    .addOption(tokenFilePathOption)
    .addOption(githubTokenOption)
    .addOption(logLevelOption)
    .addOption(refOption)
    .addOption(organizationsOption)
    .addOption(repositoriesOption)
    .addOption(packageNameOption)
    .addOption(packageVersionOption)
    .addOption(packageTypeOption)
    .action(async (options: GitToolkitCommands['UpdatePackageVersion']) => {
        const action = new UpdatePackageVersionAction(options);
        await action.run();
    });

program.parse(process.argv);
