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
        .command('add-git-remote')
        .summary(
            `Adds a NAMED remote path for fetch and push to a given locally checked out git repository.`
        )
        .usage(
            `
Adds a NAMED remote path for fetch and push to a given locally checked out git repository.
NOTE: The repository directory must have a ".git" folder for this operation to work.

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
