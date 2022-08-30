import { Command } from 'commander';
import { RemovePackageJsonScriptAction } from '../actions/remove-package-json-scipt.action';
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
    scriptKeyOption
} from './options';

export const createCommand = (program: Command) => {
    program
        .command('remove-package-json-script')
        .summary(
            `Remove a given script from the "scripts" section in "package.json" for effected repositories in the given organizations`
        )
        .usage(
            `
Remove a given script from the "scripts" section in "package.json" for effected repositories in the given organizations.

-o ORGANIZATIONS,..., n 
-k SCRIPT_KEY
[   -p GITBUB_TOKEN_FILE_PATH 
    -t GITHUB_TOKEN 
    -l ERROR|WARN|INFO|DEBUG 
    -f GIT_REF 
    -r RegExp 
    -i RepositoryName, ..., n
    -e RepositoryName, ..., n
]

Examples:

This command will remove the script with key "c9-deploy" in all repositories that contains a package.json file with a "scripts" section in the GitHub organization named "c9". The operation will use the default log level, INFO. The operation will run on the default branch of each repository scanned.

npx gitops remove-package-json-script
  -o c9
  -k "c9-deploy"

This command will remove the script with key "c9-deploy" ONLY for the repository called "top-context" if it contains a package.json file with a "scripts" section in the GitHub organization named "c9". The operation will use the DEBUG log level. The operation will run on the default branch of each repository scanned.

npx gitops remove-package-json-script
  -o c9
  -k "c9-deploy"
  -i top-context
  -l DEBUG
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
        .addOption(scriptKeyOption)
        .action(async (options: GitOpsCommands['RemovePackageJsonScript']) => {
            const action = new RemovePackageJsonScriptAction(options);
            await action.run();
        });
};
