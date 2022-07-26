import { Command } from 'commander';
import { GitOpsCommands } from '../index';
import { RenameFileAction } from '../actions/rename-file.action';
import {
    tokenFilePathOption,
    githubTokenOption,
    logLevelOption,
    refOption,
    organizationsOption,
    repositoriesOption,
    repositoryListOption,
    excludeRepositoriesOption,
    targetFilePath,
    newFileNameOption
} from './options';

export const createCommand = (program: Command) => {
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
    -i RepositoryName, ..., n
]

Examples:

Run a rename operation across ALL repositories in the Git organization "c9" where the the file at path "scripts/topdanmark-webplatform-prod-01.json" will be renamed to "scripts/topdanmark-webplatform-prod.json". All other settings will use defaults which are log level will be INFO and the branch used will be the default branch of the repository.

npx gitops rename-file
    -o c9
    --target-file-path scripts/topdanmark-webplatform-prod-01.json
    --new-file-name topdanmark-webplatform-prod.json

Run a rename operation for just one repository in the "ragnarok" Git organization called "assistant-service-api" where the the file at path "scripts/topdanmark-webplatform-prod-01.json" will be renamed to "scripts/topdanmark-webplatform-prod.json". Default settings are overriden where the operation will run with a DEBUG log level and the operation will run only on the "development" branch of each repository, if it exists. The operation also uses a user supplied Git Access Token called "abc123".

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
        .addOption(repositoryListOption)
        .addOption(excludeRepositoriesOption)
        .addOption(targetFilePath)
        .addOption(newFileNameOption)
        .action(async (options: GitOpsCommands['RenameFileAction']) => {
            const action = new RenameFileAction(options);
            await action.run();
        });
};
