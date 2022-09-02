import { Command } from 'commander';
import { GitOpsCommands } from '../index';
import { ScrapeRepositoryAction } from '../actions/scrape-repository.action';
import {
    tokenFilePathOption,
    githubTokenOption,
    logLevelOption,
    refOption,
    organizationsOption,
    repositoriesOption,
    repositoryListOption,
    excludeRepositoriesOption,
    dryRunOption
} from './options';

export const createCommand = (program: Command) => {
    program
        .command('scrape-repository')
        .summary('Downloads repositories for the given organizations.')
        .usage(
            `
Downloads repositories for the given organizations.

-o ORGANIZATIONS,..., n  
[
    -p GITBUB_TOKEN_FILE_PATH 
    -t GITHUB_TOKEN 
    -l ERROR|WARN|INFO|DEBUG 
    -f GIT_REF 
    -r RegExp 
    -i RepositoryName, ..., n
    -e RepositoryName, ..., n
    --dry-run
]

Examples:

Download all repositories in the Git organization "my-org". All other settings will use defaults which are log level will be INFO and the branch used will be the default branch of the repository.

npx gitops scrape-repository -o my-org

Download just one repository in the "ragnarok" Git organization called "assistant-service-api". Default settings are overriden where the operation will run with a DEBUG log level and the operation will run only on the "development" branch of each repository. The operation also uses a user supplied Git Access Token called "abc123".

npx gitops scrape-repository
    -o ragnarok
    -l DEBUG
    -f heads/development
    -t abc123
    -r assistant-service-api
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
        .action(async (options: GitOpsCommands['ScrapeRepository']) => {
            const action = new ScrapeRepositoryAction(options);
            await action.run();
        });
};
