import { Command } from 'commander';
import { GitOpsCommands } from '../index';
import { DownloadRepositoryAction } from '../actions/download-repository.action';
import {
    logLevelOption,
    refOption,
    organizationsOption,
    repositoriesOption,
    repositoryListOption,
    excludeRepositoriesOption,
    dryRunOption,
    skipExistingOption,
    overwriteExistingOption,
    extractDownloadOption,
    gitConfigNameOption
} from '../commands/options';

export const createCommand = (program: Command) => {
    program
        .command('download-repository')
        .summary('Downloads repositories for the given organizations.')
        .usage(
            `
Downloads repositories (as tarball) for the given organizations. Optionally, extract downloaded tarball.

-o ORGANIZATIONS,..., n  
-c, --git-config-name default
[
    -l ERROR|WARN|INFO|DEBUG 
    -f, --ref GIT_REF 
    -r RegExp 
    -i RepositoryName, ..., n
    -e RepositoryName, ..., n
    --dry-run
    --overwrite-existing
    --skip-existing
    --extract-download
]

Examples:

Download all repositories in the Git organization "my-org". All other settings will use defaults which are log level will be INFO and the branch used will be the default branch of the repository.

npx gitops download-repository -o my-org

Download just one repository in the "my-org" Git organization called "my-service-api". Default settings are overriden where the operation will run with a DEBUG log level and the operation will run only on the "development" branch of each repository. The operation also uses a user supplied Git Access Token called "abc123".

npx gitops download-repository
    -o my-org
    -l DEBUG
    -f heads/development
    -r my-service-api

The command, be default, will skip downloading a repository when it detects that the target download path already has a folder with the repository name.
This can be overriden by supplying --overwrite-existing option to the command:

npx gitops download-repository
    -o my-org
    -l DEBUG
    -f heads/development
    -r my-service-api
    --overwrite-existing

If both --overwrite-existing and --skip-existing are spcified, then the command will fall back to its default operation mode which is to only skip existing repositories.

The command includes the ability to extarct the downloaded repository package. The extracted tarball contents will be placed in the same folder as the tarball itself:

npx gitops download-repository
    -o my-org
    -l DEBUG
    -f heads/development
    -r my-service-api
    --extract-download

`
        )
        .addOption(dryRunOption)
        .addOption(gitConfigNameOption)
        .addOption(skipExistingOption)
        .addOption(overwriteExistingOption)
        .addOption(logLevelOption)
        .addOption(refOption)
        .addOption(organizationsOption)
        .addOption(repositoriesOption)
        .addOption(repositoryListOption)
        .addOption(excludeRepositoriesOption)
        .addOption(extractDownloadOption)
        .action(async (options: GitOpsCommands['DownloadRepository']) => {
            try {
                let sanitizedOptions = options;
                if (options.overwriteExisting && options.skipExisting) {
                    sanitizedOptions = {
                        ...options,
                        overwriteExisting: false,
                        skipExisting: true
                    };
                }

                const action = new DownloadRepositoryAction(sanitizedOptions);

                await action.run();
            } catch (e) {
                program.help({
                    error: true
                });
            }
        });
};
