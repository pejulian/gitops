import { Command, Option } from 'commander';
import { LogLevel } from './utils/logger.util';
import { RenameFileAction } from './actions/rename-file.action';

export type GitToolkitCommands = {
    Common: Readonly<{
        organizations: Array<string>;
        githubToken?: string;
        tokenFilePath?: string;
        logLevel: string;
        ref: string;
    }>;
    RenameFileAction: Readonly<{
        repositories?: string;
        targetFilePath: string;
        newFileName: string;
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
    "A path to the file in your user's home directory where the GitHub Personal Access Token is stored"
);

const githubTokenOption = new Option(
    '-t, --github-token <value>',
    'Your GitHub Personal Access Token that will be used to when running Git commands against our GitHub service'
);

const organizationsOption = new Option(
    '-o, --organizations [value...]',
    'A list of Github organizations to search for repositories. You may specify one or more organizations separated by a whitespace character.'
).makeOptionMandatory(true);

const logLevelOption = new Option(
    '-l, --log-level <value>',
    'The log level to use while executing commands'
)
    .choices(Object.keys(LogLevel))
    .default('INFO');

const refOption = new Option(
    '-f, --ref <value>',
    'A specific reference of the repository to narrow down on. If specifying a branch, the format must be `heads/branch_name`. If specifying a tag, the format must be `tags/tag_name`.'
).default('heads/master');

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

program
    .command('rename-file')
    .usage(
        '-o ORGANIZATIONS,..., n [-p GITBUB_TOKEN_FILE_PATH -t GITHUB_TOKEN -l ERROR|WARN|INFO|DEBUG -f GIT_REF -r REPOSITORIES, ..., n | RegExp ]'
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

program.parse(process.argv);
