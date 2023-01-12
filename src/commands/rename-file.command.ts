import { Command } from 'commander';
import { GitOpsCommands } from '../index';
import { RenameFileAction } from '../actions/rename-file.action';
import {
    logLevelOption,
    refOption,
    organizationsOption,
    repositoriesOption,
    repositoryListOption,
    excludeRepositoriesOption,
    targetFilePathOption,
    newFileNameOption,
    dryRunOption,
    gitConfigNameOption
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
-c, --git-config-name default
--target-file-path path/to/file/in/repo/file.extension 
--new-file-name newFileName.extension 
[
    -l ERROR|WARN|INFO|DEBUG 
    -f, --ref GIT_REF 
    -r RegExp 
    -i RepositoryName, ..., n
    -e RepositoryName, ..., n
    --dry-run
]

Examples:

Run a rename operation across ALL repositories in the Git organization "bat" where the the file at path "scripts/my-settings.json" will be renamed to "scripts/their-settings.json". All other settings will use defaults which are log level will be INFO and the branch used will be the default branch of the repository. NOTE: --new-file-name is specified without a path as it will use the path from the --target-file-path.

npx gitops rename-file
    -o bat
    --target-file-path scripts/my-settings.json
    --new-file-name their-settings.json

Run a rename operation for just one repository in the "fooz" Git organization called "ball" where the the file at path "scripts/prod-settings.json" will be renamed to "scripts/dev-settings.json". Default settings are overriden where the operation will run with a DEBUG log level and the operation will run only on the "development" branch of each repository, if it exists.

npx gitops rename-file
    -o fooz
    -l DEBUG
    -f heads/development
    -r ball
    --target-file-path scripts/prod-settings.json
    --new-file-name dev-settings.json
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
        .addOption(targetFilePathOption)
        .addOption(newFileNameOption)
        .action(async (options: GitOpsCommands['RenameFile']) => {
            try {
                const action = new RenameFileAction(options);
                await action.run();
            } catch (e) {
                program.help({ error: true });
            }
        });
};
