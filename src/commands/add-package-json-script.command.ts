import { Command } from 'commander';
import { AddPackageJsonScriptAction } from '../actions/add-package-json-script.action';
import { GitOpsCommands } from '../index';
import {
    logLevelOption,
    refOption,
    organizationsOption,
    repositoriesOption,
    repositoryListOption,
    excludeRepositoriesOption,
    scriptKeyOption,
    scriptValueOption,
    overrideExistingScriptKeyOption,
    dryRunOption,
    gitConfigNameOption
} from './options';

export const createCommand = (program: Command) => {
    program
        .command('add-package-json-script')
        .summary(
            `Adds a script to the "scripts" section in "package.json" for effected repositories in the given organizations`
        )
        .usage(
            `
Adds a script to the "scripts" section in "package.json" for effected repositories in the given organizations.

-o ORGANIZATIONS,..., n 
-c, --git-config-name default
-k SCRIPT_KEY
-a SCRIPT_VALUE
-d 
[   -l ERROR|WARN|INFO|DEBUG 
    -f, --ref GIT_REF 
    -r RegExp 
    -i RepositoryName, ..., n
    -e RepositoryName, ..., n
    --dry-run
]

Examples:

This command will add the script with key "test" and value "jest" in all repositories that contains a package.json file with a "scripts" section in the GitHub organization named "foo". The operation will use the default log level, INFO. The operation will run on the default branch of each repository scanned.

npx gitops add-package-json-script
  -o foo
  -k "test"
  -a "npm run test"

This command will add the script with key "test:coverage" and value "./node_modules/.bin/jest --coverage" ONLY for the repository called "foo-bar" if it contains a package.json file with a "scripts" section in the GitHub organization named "baz". The operation will use the DEBUG log level. The operation will run on the default branch of each repository scanned.

npx gitops add-package-json-script
  -o baz
  -k "test:coverage"
  -a "./node_modules/.bin/jest --coverage"
  -i foo-bar
  -l DEBUG
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
        .addOption(scriptKeyOption)
        .addOption(scriptValueOption)
        .addOption(overrideExistingScriptKeyOption)
        .action(async (options: GitOpsCommands['AddPackageJsonScript']) => {
            try {
                const action = new AddPackageJsonScriptAction(options);
                await action.run();
            } catch (e) {
                program.help({
                    error: true
                });
            }
        });
};
