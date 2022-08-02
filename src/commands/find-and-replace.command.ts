import { Command } from 'commander';
import { FindAndReplaceAction } from '../actions/find-and-replace.action';
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
    searchForOption,
    replaceWithOption,
    filesToMatchOption,
    searchForFlagsOption
} from './options';

export const createCommand = (program: Command) => {
    program
        .command('find-and-replace')
        .summary(
            `Finds and replaces matches of the supplied regex for a given list of files in relevant repositories for the given Git organizations.`
        )
        .usage(
            `
Finds and replace matches of the supplied regex for a given list of files in relevant repositories for the given Git organizations.

-o ORGANIZATIONS,..., n 
--search-for
--files-to-match
--replace-with
[   -p GITBUB_TOKEN_FILE_PATH 
    -t GITHUB_TOKEN 
    -l ERROR|WARN|INFO|DEBUG 
    -f GIT_REF 
    -r RegExp 
    -i RepositoryName, ..., n
    -e RepositoryName, ..., n
    --search-for-flags
]

Examples:

This command will look for strings matching "Region=us-east-1" in repositories that contain the file at path "etc/application.conf" in the "c9" Git organization and rename all matches to "Region=eu-west-1". All other settings will use defaults; log level = INFO, search for flags = g:

npx gitops find-and-replace 
  -o c9
  --files-to-match etc/application.conf
  --search-for Region=us-east-1
  --replace-with Region=eu-west-1

This

npx gitops find-and-replace -l DEBUG-o c9 -i c9-stakeholderview-selector --files-to-match etc/application.conf --search-for Region=us-east-1 --replace-with Region=eu-west-1

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
        .addOption(searchForOption)
        .addOption(searchForFlagsOption)
        .addOption(replaceWithOption)
        .addOption(filesToMatchOption)
        .action(async (options: GitOpsCommands['FindAndReplace']) => {
            const action = new FindAndReplaceAction(options);
            await action.run();
        });
};
