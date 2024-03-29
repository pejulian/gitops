import { Option } from 'commander';
import { LogLevel } from '../utils/logger.util';

export const dryRunOption = new Option(
    `-u, --dry-run`,
    `When this flag is set, the action will be performed without committing the changes to the remote repository`
)
    .default(
        false,
        'By default, operations performed will be committed/executed.'
    )
    .makeOptionMandatory(false);

export const organizationsOption = new Option(
    '-o, --organizations [value...]',
    'A list of Github organizations to search for repositories. You may specify one or more organizations separated by a whitespace character.'
).makeOptionMandatory(true);

export const logLevelOption = new Option(
    '-l, --log-level <value>',
    '[OPTIONAL] The log level to use while executing commands. Choose a higher log severity to view more logs in the console when running commands.'
)
    .choices(
        Object.values(LogLevel).filter(
            (value) => typeof value === 'string'
        ) as string[]
    )
    .default('INFO', 'By default, the log level "INFO" is used');

export const refOption = new Option(
    '-f, --ref <value>',
    '[OPTIONAL] A specific reference of the repository to narrow down on. If specifying a branch, the format must be `heads/branch_name`. If specifying a tag, the format must be `tags/tag_name`. If not supplied, most commands will fallback to use the default branch of the repository.'
);

export const gitConfigNameOption = new Option(
    `-c, --git-config-name <value>`,
    `The git config name as defined in .gitopsrc.json. This should be a valid configuration that has been created in a file called .gitopsrc.json in the user's home directory`
)
    .makeOptionMandatory(true)
    .default(
        `default`,
        'If a value is not provided, the value "default" will be used.'
    );

export const repositoriesOption = new Option(
    '-r, --repositories <value>',
    'A regex string to match repositories in the organization to apply the action on.'
);

export const repositoryListOption = new Option(
    '-i, --repository-list [value...]',
    'A list of repositories to run the operation on. Overrides the list of repositories that the -r option supplies, if specified.'
);

export const excludeRepositoriesOption = new Option(
    '-e, --exclude-repositories [value...]',
    'A list of repositories to be excluded when a command is run on an organization.'
);

export const targetFilePathOption = new Option(
    '--target-file-path <value>',
    'The path to the filename that should be renamed'
).makeOptionMandatory(true);

export const newFileNameOption = new Option(
    '--new-file-name <value>',
    'The new file name to replace the old filename with'
).makeOptionMandatory(true);

export const packageNameOption = new Option(
    `-n, --package-name <value>`,
    `The name of the NPM package to search for in package.json (for example @types/jest)`
).makeOptionMandatory(true);

export const packageVersionOption = new Option(
    `-v, --package-version <value>`,
    `The version of the NPM package to update. This value must be a valid semver syntax or an existing NPM distribution tag like "latest", "beta", "canary" etc. Run npm view <package_name> to view the versions and distribution tags that are available for the project you are trying to update.`
).makeOptionMandatory(true);

export const packageTypeOption = new Option(
    `-y, --package-type <value>`,
    `[OPTIONAL] The type of dependency. Specify "s" for a normal dependency, "d" for devDependencies or "o" for optionalDependencies`
)
    .choices(['s', 'd', 'o'])
    .default(
        's',
        'By default, all operations using this option will run on normal dependencies.'
    );

export const packageUpdateConstraintOption = new Option(
    `--package-update-constraint <value>`,
    `[OPTIONAL] This flag applies checks to the CURRENT VERSION OF THE PACKAGE INSTALLED. A valid semver string (e.g. 2.x.x) or distribution tag (e.g. latest, beta) to determines if the CURRENT PACKAGE VERSION meets the criteria to be updated/reinstalled (only works if an update condition has been specified via the --package-update-constraint flag)`
);

export const packageUpdateConditionOption = new Option(
    `--package-update-condition <value>`,
    `[OPTIONAL] This flag applies checks to the CURRENT VERSION OF THE PACKAGE INSTALLED. Apply a package update/reinstall condition on the CURRENT PACKAGE VERSION to determine if it satisfies the constraint supplied in --package-update-constraint`
).choices(['lt', 'lte', 'gt', 'gte', 'eq']);

export const runCommandsOption = new Option(
    `--run-commands [value...]`,
    `A list of commands to run in sequence which will be evaluated as the success criteria determining if the given package is deployable`
).default(['npm ci', 'npm run test']);

export const mandatoryFilesOption = new Option(
    `--mandatory-files [value...]`,
    `A list of files that must be present in the repository for it to be deemed as deployable`
).default([]);

export const searchForOption = new Option(
    `--search-for <value>`,
    `A regex string containing the match to search for in files. Use a site like https://regex101.com/ to construct and test expressions that will accomplish the find and replace criteria you have against given content. Only specify the body of the regexp here. To specify flags for the regexp, use the --search-for-flags option.`
);

export const searchForFlagsOption = new Option(
    `--search-for-flags <value>`,
    `Regex flags to apply to the supplied regex string via --search-for. Use a site like https://regex101.com/ to construct and test expressions that will accomplish the find and replace criteria you have against given content`
).default('g');

export const replaceWithOption = new Option(
    `--replace-with <value>`,
    `A string containing a value to replace a matched search string.`
);

export const filesToMatchOption = new Option(
    `--files-to-match [value...]`,
    `An array of regexes that will be used to match files in the repository`
);

export const scriptKeyOption = new Option(
    `-k, --script-key <value>`,
    `The key for a script in the "scripts" section of "package.json"`
).makeOptionMandatory(true);

export const scriptValueOption = new Option(
    `-a, --script-value <value>`,
    `The value for a script in the "scripts" section of "package.json"`
).makeOptionMandatory(true);

export const overrideExistingScriptKeyOption = new Option(
    `-d, --override-existing-script-key`,
    `If specified, relevant operations will override existing keys if found in the "scripts" section of "package.json"`
)
    .makeOptionMandatory(false)
    .default(
        false,
        'By default, the operation will not override existing scripts'
    );

export const overwriteExistingOption = new Option(
    `--overwrite-existing`,
    `Replaces any content that exists in the target path of the download in the local filesystem`
).makeOptionMandatory(false);

export const skipExistingOption = new Option(
    `--skip-existing`,
    `Skips any content that exists in the target path of the download in the local filesystem`
).makeOptionMandatory(false);

export const extractDownloadOption = new Option(
    `--extract-download`,
    `Extracts the downloaded repository in the target folder`
).makeOptionMandatory(false);
