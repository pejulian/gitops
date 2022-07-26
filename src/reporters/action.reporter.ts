export type RepositoryOutcome = Readonly<{
    name: string;
    reason: string;
}>;

export class ActionReporter {
    private skippedRepositories: Array<RepositoryOutcome>;
    private failedRepositories: Array<RepositoryOutcome>;

    constructor() {
        this.skippedRepositories = [];
        this.failedRepositories = [];
    }

    public addSkipped(repositoryName: string, reason: string): void {
        this.skippedRepositories.push({
            name: repositoryName,
            reason
        });
    }

    public addFailed(repositoryName: string, reason: string): void {
        this.failedRepositories.push({
            name: repositoryName,
            reason
        });
    }
}
