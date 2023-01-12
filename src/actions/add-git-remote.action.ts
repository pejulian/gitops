import { GitOpsCommands } from '../index';
import { GitHubRepository } from '../utils/github.util';
import { LoggerUtil, LogLevel } from '../utils/logger.util';
import { GenericAction } from './generic.action';

export type AddGitRemoteActionOptions = GitOpsCommands['AddGitRemote'];

export type AddGitRemoteActionResponse = void;

export class AddGitRemoteAction extends GenericAction<AddGitRemoteActionResponse> {
    constructor(options: AddGitRemoteActionOptions) {
        AddGitRemoteAction.CLASS_NAME = 'AddGitRemoteAction';

        super({
            gitConfigName: options.gitConfigName,
            logLevel: LogLevel[options.logLevel as keyof typeof LogLevel],
            organizations: options.organizations,
            repositoryList: options.repositoryList,
            excludeRepositories: options.excludeRepositories,
            repositories: options.repositories,
            ref: options.ref,
            command: AddGitRemoteAction.CLASS_NAME,
            dryRun: options.dryRun
        });
    }

    public async run(): Promise<AddGitRemoteActionResponse> {
        this.actionReporter.startReport(this.organizations, [``]);

        // Run for every given organization
        for await (const [
            index,
            organization
        ] of this.organizations.entries()) {
            this.actionReporter.addSubHeader([
                `[${index + 1}|${
                    this.organizations.length
                }] Running for the organization ${organization}`
            ]);

            let repositories: Array<GitHubRepository>;

            try {
                repositories =
                    await this.listApplicableRepositoriesForOperation(
                        organization
                    );
            } catch (e) {
                this.logger.error(
                    `[${AddGitRemoteAction.CLASS_NAME}.run]`,
                    `Failed to list repositories for the ${organization} organization\n`,
                    e
                );

                this.actionReporter.addGeneralError({
                    message: `${LoggerUtil.getErrorMessage(e)}`
                });

                continue;
            }
        }

        this.actionReporter.completeReport();
    }
}
