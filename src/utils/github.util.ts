import os from 'os';
import _find from 'lodash/find';
import _filter from 'lodash/filter';
import _chain from 'lodash/chain';
import { Agent } from 'https';

import { Octokit, RestEndpointMethodTypes } from '@octokit/rest';
import { operations, components } from '@octokit/openapi-types';

import { MODULE_NAME, MODULE_VERSION } from '../index';
import { FilesystemUtil, GlobOptions } from './filesystem.util';
import { LoggerUtil } from './logger.util';
import { ConfigUtil } from './config.util';
import { TarUtil } from './tar.util';

export type GitHubRepository = components['schemas']['minimal-repository'];

export type RespositoryFile = FileItem;

export type GitTreeWithFileDescriptor = Readonly<{
    tree: GitTree;
    descriptors: Array<GitTreeItem>;
}>;

export type GetBlobOptions = Readonly<{
    encoding?: BufferEncoding;
}>;

export type GetContentOptions = Readonly<{
    encoding?: BufferEncoding;
    /**
     * The name of the commit/branch/tag.
     * Defaults to the repository's default branch (usually `master`)
     */
    ref?: string;
}>;

type DirectoryListing = components['schemas']['content-directory'];
type FileItem = components['schemas']['content-file'];
type BlobItem = components['schemas']['blob'];

export type GitReference = components['schemas']['git-ref'];
export type GitTree = components['schemas']['git-tree'];
export type GitTreeItem = UnpackedArray<
    components['schemas']['git-tree']['tree']
>;
export type GitCommit = components['schemas']['git-commit'];
export type ShortBlob = components['schemas']['short-blob'];
export type GitCreateCommitResponse = components['schemas']['git-commit'];

export type GitTreeItemWithGitTree = [GitTreeItem, GitTreeHierachy];
export type GitTreeHierachy = Omit<GitTree, 'tree'> & {
    tree: Array<GitTreeItem | GitTreeItemWithGitTree>;
};

export type CommitResponse =
    RestEndpointMethodTypes['git']['updateRef']['response'];

export type EnrichedGitTreeItem = GitTreeItem &
    Readonly<{
        treeSha?: string;
    }>;

export type FlattenedGitTree = Omit<GitTree, 'tree'> & {
    tree: Array<EnrichedGitTreeItem>;
};

export type GithubUtilsOptions = Readonly<{
    githubToken?: string;
    tokenFilePath?: string;
    baseDir?: string;
    logger: LoggerUtil;
    filesystemUtil: FilesystemUtil;
    configUtil: ConfigUtil;
    tarUtil: TarUtil;
}>;

export type CurrentCommitSha = Readonly<{
    commitSha: string;
    treeSha: string;
}>;

export class GithubUtil {
    private static readonly CLASS_NAME = 'GithubUtil';

    public static GITHUB_TOKEN_PATH = '.git-token';
    public static GITHUB_API_BASE_PATH = 'https://api.github.com';

    private readonly baseDir: string | undefined;
    private readonly octokit: Octokit;
    private readonly logger: LoggerUtil;
    private readonly filesystemUtil: FilesystemUtil;
    private readonly configUtil: ConfigUtil;
    private readonly tarUtil: TarUtil;

    constructor(options: GithubUtilsOptions) {
        this.logger = options.logger;

        this.filesystemUtil = options.filesystemUtil;
        this.configUtil = options.configUtil;
        this.tarUtil = options.tarUtil;

        const moduleConf = this.configUtil.readConfiguration();

        if (moduleConf.gitApiBase) {
            GithubUtil.GITHUB_API_BASE_PATH = moduleConf.gitApiBase;
        }

        if (moduleConf.gitTokenFilePath) {
            GithubUtil.GITHUB_TOKEN_PATH = moduleConf.gitTokenFilePath;
        }

        this.baseDir = options?.baseDir;

        const pat = (
            options?.githubToken ??
            this.filesystemUtil.readFile(
                `${os.homedir()}/${
                    options?.tokenFilePath ?? GithubUtil.GITHUB_TOKEN_PATH
                }`
            )
        )
            ?.replace('\n', '')
            ?.replace('\r', '')
            ?.trim();

        if (!pat) {
            this.logger.error(
                `[${GithubUtil.CLASS_NAME}.constructor]`,
                `A valid GitHub Personal Access Token (PAT) is required to use this module.
                
                While it is true that some GitHub APIs can be accessed without authorization, it is not a recommended approach.
                Furthermore, calls without authorization will be throttled more significantly than those with authorization.
                Because this modules makes heavy use of GitHub APIs, it requires a valid token for authorization.
                
                To ensure you have a valid authorization token:

                Create a file called ${
                    GithubUtil.GITHUB_TOKEN_PATH
                } in your user home directory containing a valid PAT

                
                To customize the file name and/or subdirectory path to a file containing your PAT, you can use the --token-file-path argument.
                Please note however, that this path must STILL BE in your home directory ${os.homedir()}.
                `
            );

            throw new Error('Missing GitHub Personal Access Token');
        }

        this.octokit = new Octokit({
            auth: pat,
            baseUrl: GithubUtil.GITHUB_API_BASE_PATH,
            request: { agent: new Agent({ rejectUnauthorized: false }) },
            userAgent: `${MODULE_NAME} ${MODULE_VERSION}`
        });
    }

    /**
     * Returns a list of repository names for the given organization.
     * Options can be specified to include archived, disabled or forked repositories.
     * @param organization The Git organization where repositories will be searched for
     * @param options Additional configuration options to be applied when searchinf for repositories
     * @returns
     */
    public async listRepositoriesForOrganization(
        organization: string,
        options: Readonly<
            Partial<{
                includeForks: boolean;
                includeArchived: boolean;
                includeDisabled: boolean;
                /**
                 * Only return the given repository name.
                 * Will be ignored if `onlyFromList` is specified.
                 */
                onlyInclude: string;
                excludeRepositories: Array<string>;
                onlyFromList: Array<string>;
            }>
        > = {
            includeForks: false,
            includeArchived: false,
            includeDisabled: false,
            excludeRepositories: []
        }
    ): Promise<Array<GitHubRepository>> {
        const repositories: Array<GitHubRepository> = [];

        try {
            for await (const response of this.octokit.paginate.iterator(
                'GET /orgs/{org}/repos',
                {
                    org: organization,
                    type: 'all'
                }
            )) {
                response.data.map((repository) => {
                    if (
                        (options.includeForks || !repository.fork) &&
                        (options.includeArchived || !repository.archived) &&
                        (options.includeDisabled || !repository.disabled)
                    ) {
                        // Do not include if repository should be excluded (this is the -e flag)
                        // Overrides onlyFromList (-i) and onlyInclude (-r)
                        if (
                            options.excludeRepositories?.includes(
                                repository.name
                            )
                        ) {
                            return;
                        }

                        // The (-i) flag. Overrides the (-r) flag even if it is defined
                        if (options.onlyFromList) {
                            if (
                                !options.onlyFromList.includes(repository.name)
                            ) {
                                return;
                            }
                        }

                        // If onlyInclude is defined AND onlyFromList is not, check if the criteria is met before including the repository
                        // NOTE: Only works if (-i) is not defined
                        if (
                            options.onlyInclude &&
                            typeof options.onlyFromList === 'undefined'
                        ) {
                            const exp = new RegExp(options.onlyInclude);
                            if (!exp.test(repository.name)) {
                                return;
                            }
                        }

                        repositories.push(repository);
                    }
                });
            }
            return repositories;
        } catch (e) {
            this.logger.error(
                `[${GithubUtil.CLASS_NAME}.listRepositoriesForOrganization]`,
                `Could not list repositories for ${organization}\n`,
                e
            );

            throw e;
        }
    }

    /**
     * Gets the root tree for the given repository
     * @param repository The repository to use
     * @param ref The reference to search for. Must be formated as "heads/branch_name" for branches or "tags/tag_name" for tags
     * @param recursive Should all subtree's be returned as well
     */
    public async getRepositoryGitTree(
        repository: GitHubRepository,
        ref = `heads/master`,
        recursive?: boolean
    ): Promise<GitTree> {
        try {
            const reference = await this.getReference(repository, ref);

            if (!reference) {
                throw new Error(
                    `No reference found in ${repository.name}: <${ref}>`
                );
            }

            const commit = await this.getCommit(
                repository,
                reference.object.sha
            );

            if (!commit) {
                throw new Error(
                    `No commit found for reference object SHA ${reference.object.sha}`
                );
            }

            const tree = await this.getTree(
                repository,
                commit.tree.sha,
                recursive
            );

            return tree;
        } catch (e) {
            this.logger.error(
                `[${GithubUtil.CLASS_NAME}.getRepositoryGitTree]`,
                `Could not get repository root tree with ref ${ref} for ${repository.name}\n`,
                e
            );

            throw e;
        }
    }

    /**
     * Gets the Git Tree for the Tree Item of type "tree".
     * Will throw an error if the Git Item passed is not of type "tree".
     *
     * @param repository The repository to use
     * @param item The Git Tree Item
     */
    public async getTreeForTreeItem(
        repository: GitHubRepository,
        item: GitTreeItem
    ): Promise<GitTree> {
        if (!item.sha) {
            throw new Error('Tree item missing sha');
        }

        if (item.type !== 'tree') {
            throw new Error('Tree item is not of type "tree"');
        }

        const tree = await this.getTree(repository, item.sha);

        return tree;
    }

    /**
     * Recursively fetches all sub trees from the given root tree
     * @param repository The repository to which the tree belongs to
     * @param rootTree The Git tree to start from
     */
    public async getTreesRecursively(
        repository: GitHubRepository,
        rootTree: GitTree
    ): Promise<GitTreeHierachy> {
        const recursivelyResolvedSubtrees = await Promise.all(
            rootTree.tree.map(async (treeItem) => {
                if (treeItem.type === 'tree') {
                    const treeForTreeItem = await this.getTreeForTreeItem(
                        repository,
                        treeItem
                    );

                    return [
                        treeItem,
                        await this.getTreesRecursively(
                            repository,
                            treeForTreeItem
                        )
                    ] as GitTreeItemWithGitTree;
                }

                return treeItem;
            })
        );

        return {
            ...rootTree,
            tree: recursivelyResolvedSubtrees
        };
    }

    /**
     * Get all trees of a repository on the given ref without the risk of getting a truncated tree as all child trees are fetched using individual requests.
     *
     * To get a response that is similar to {@linkcode getRepositoryGitTree}, pass true as the 3rd argument of this function. The response will now include all blob paths in the root array with an added property of which tree it belongs to.
     *
     * @param repository The repository object
     * @param ref The git reference to operate on
     * @param flatten Flatten the hierarchy so that all blobs are returned in the root array
     * @returns
     */
    public async getRepositoryFullGitTree(
        repository: GitHubRepository,
        ref?: string,
        flatten?: false
    ): Promise<GitTreeHierachy>;
    public async getRepositoryFullGitTree(
        repository: GitHubRepository,
        ref?: string,
        flatten?: true
    ): Promise<FlattenedGitTree>;
    public async getRepositoryFullGitTree(
        repository: GitHubRepository,
        ref = `heads/master`,
        flatten?: boolean
    ): Promise<GitTreeHierachy | FlattenedGitTree> {
        try {
            const reference = await this.getReference(repository, ref);

            if (!reference) {
                throw new Error(
                    `No reference found in ${repository.name}: <${ref}>`
                );
            }

            const commit = await this.getCommit(
                repository,
                reference.object.sha
            );

            if (!commit) {
                throw new Error(
                    `No commit found for reference object SHA ${reference.object.sha}`
                );
            }

            const rootTree = await this.getTree(repository, commit.tree.sha);

            const hierarchy = await this.getTreesRecursively(
                repository,
                rootTree
            );

            if (flatten) {
                return GithubUtil.flattenGitTreeHierarchy(hierarchy);
            } else {
                return hierarchy;
            }
        } catch (e) {
            this.logger.error(
                `[${GithubUtil.CLASS_NAME}.getRepositoryGitTree]`,
                `Could not get trees for ${repository.name} with ref ${ref}\n`,
                e
            );

            throw e;
        }
    }

    /**
     * Gets all release tags for this repository.
     *
     * @param repository The repository name
     * @param options
     * @returns
     */
    public async listReleaseTags(
        repository: GitHubRepository,
        options?: Pick<
            RestEndpointMethodTypes['repos']['listReleases']['parameters'],
            'per_page' | 'page'
        >
    ): Promise<Array<string>> {
        try {
            const tags: Array<string> = [];

            for await (const response of this.octokit.paginate.iterator(
                // this.octokit.rest.repos.listReleases,
                'GET /repos/{owner}/{repo}/releases',
                {
                    owner: repository.owner.login,
                    repo: repository.name,
                    ...(options && options)
                }
            )) {
                response.data.forEach((release) => {
                    tags.push(release.tag_name);
                });
            }

            return tags;
        } catch (e) {
            this.logger.error(
                `[${GithubUtil.CLASS_NAME}.listReleaseTags]`,
                `Could not list release tags for ${repository.name}\n`,
                e
            );

            throw e;
        }
    }

    /**
     * Gets the last release tag.
     *
     * @param repository The repository
     * @returns
     */
    public async listLastReleaseTag(
        repository: GitHubRepository
    ): Promise<string | undefined> {
        try {
            const tags: Array<string> = await this.listReleaseTags(repository, {
                page: 1,
                per_page: 1
            });

            return tags.length > 0 ? tags[0] : undefined;
        } catch (e) {
            this.logger.error(
                `[${GithubUtil.CLASS_NAME}.listLastReleaseTag]`,
                `Could not list the last release tag for ${repository.name}\n`,
                e
            );

            throw e;
        }
    }

    /**
     * Gets the last 50 release tags.
     *
     * @param repository The repository
     * @returns
     */
    public async listLast50ReleaseTags(
        repository: GitHubRepository
    ): Promise<Array<string>> {
        try {
            const tagNames: Array<string> = await this.listReleaseTags(
                repository,
                {
                    page: 1,
                    per_page: 50
                }
            );

            return tagNames;
        } catch (e) {
            this.logger.error(
                `[${GithubUtil.CLASS_NAME}.listLast50ReleaseTags]`,
                `Could not list the last 50 release tags for ${repository.name}\n`,
                e
            );

            throw e;
        }
    }

    /**
     * Obtains the tree details based on the given tree SHA.
     * @param repository The repository
     * @param tree_sha The tree SHA obtained from the {@linkcode GithubUtil.getCommit} function
     * @param recursive should all subtrees be returned when getting the specified tree
     * @returns
     */
    public async getTree(
        repository: GitHubRepository,
        tree_sha: string,
        recursive?: boolean
    ): Promise<GitTree> {
        try {
            const result = await this.octokit.git.getTree({
                owner: repository.owner.login,
                repo: repository.name,
                tree_sha,
                recursive:
                    typeof recursive === 'boolean' && recursive
                        ? '1'
                        : undefined
            });

            if (result.status !== 200) {
                throw new Error(
                    `Non successful status code while getting "${tree_sha}" - ${result.status}`
                );
            }

            if (result.data.truncated) {
                this.logger.warn(
                    `[${GithubUtil.CLASS_NAME}.getTree]`,
                    `The tree ${tree_sha} is truncated\n`
                );
            }

            return result.data;
        } catch (e) {
            this.logger.error(
                `[${GithubUtil.CLASS_NAME}.getTree]`,
                `Could not obtain tree "${tree_sha}" from ${repository.name}\n`,
                e
            );
            throw e;
        }
    }

    /**
     *
     * @param repository The repository to operatate on
     * @param blobs An array of blobs containing new files to be created in the new tree
     * @param paths An array of paths representing how these blobs (files) will be located in the tree
     * @param tree The tree where new blobs will be appended to
     * @param parentTreeSha The parent tree
     * @param options Additional options to consider when creating the new tree
     * @returns
     */
    public async createNewTree(
        repository: GitHubRepository,
        blobs: Array<ShortBlob>,
        paths: Array<string>,
        tree?: GitTree,
        parentTreeSha?: string,
        options?: Readonly<{
            referenceDescriptors?: Array<GitTreeItem>;
        }>
    ): Promise<GitTree> {
        type CreateTree = UnpackedArray<
            operations['git/create-tree']['requestBody']['content']['application/json']['tree']
        >;

        const mappedBlobs: Array<CreateTree> = blobs.map(({ sha }, index) => {
            // Try to find the tree item for the blob that is being mapped in reference descriptors if provided
            const descriptor = _find(
                options?.referenceDescriptors,
                (descriptor) =>
                    descriptor.path
                        ? descriptor.path?.includes(paths[index])
                        : false
            );

            return {
                mode: descriptor?.mode ?? '100644',
                type: descriptor?.type ?? 'blob',
                path: paths[index],
                sha
            } as CreateTree;
        });

        const response = await this.octokit.git.createTree({
            owner: repository.owner.login,
            repo: repository.name,
            base_tree: tree ? undefined : parentTreeSha,
            tree: tree
                ? [
                      ...(tree.tree as unknown as Array<CreateTree>),
                      ...mappedBlobs
                  ]
                : mappedBlobs
        });

        return response.data;
    }

    /**
     * Gets the latest commit for the given ref
     * An optional tree SHA can be supplied. If available, the latest commit will be fetched from this tree instead.
     */
    public async getCurrentCommit(
        repository: GitHubRepository,
        ref = `heads/${repository.default_branch}`
    ): Promise<CurrentCommitSha> {
        const { object: refObject } = await this.getReference(repository, ref);
        const sha = refObject.sha;

        const commit = await this.getCommit(repository, sha);

        return {
            commitSha: sha,
            treeSha: commit.tree.sha
        };
    }

    /**
     * Obtains the commit details based on the given commit SHA.
     * @param repository The repository
     * @param commit_sha The commit SHA obtained from the {@linkcode GithubUtil.getReference} function
     * @returns
     */
    public async getCommit(
        repository: GitHubRepository,
        commit_sha: string
    ): Promise<GitCommit> {
        try {
            const result = await this.octokit.git.getCommit({
                owner: repository.owner.login,
                repo: repository.name,
                commit_sha
            });

            if (result.status !== 200) {
                throw new Error(
                    `Non successful status code (${result.status}) while getting "${commit_sha}"`
                );
            }

            return result.data;
        } catch (e) {
            this.logger.error(
                `[${GithubUtil.CLASS_NAME}.getCommit]`,
                `Could not obtain commit "${commit_sha}" from ${repository.name}\n`,
                e
            );
            throw e;
        }
    }

    /**
     * Creates a commit to the given tree
     * @param repository
     * @param commitMessage
     * @param treeSHA
     * @returns
     */
    public async createCommit(
        repository: GitHubRepository,
        commitMessage: string,
        treeSHA: string,
        commitSHA: string
    ) {
        try {
            const result = await this.octokit.git.createCommit({
                owner: repository.owner.login,
                repo: repository.name,
                message: commitMessage,
                tree: treeSHA,
                parents: [commitSHA]
            });

            return result.data;
        } catch (e) {
            this.logger.error(
                `[${GithubUtil.CLASS_NAME}.createCommit]`,
                `Failed to create a new commit for ${repository.name} with the given tree SHA ${treeSHA} and commit SHA ${commitSHA}\n`,
                e
            );
            throw e;
        }
    }

    public async createBlobForFile(
        repository: GitHubRepository,
        filePath: string,
        encoding: 'utf-8' | 'base64' = 'utf-8'
    ): Promise<ShortBlob> {
        try {
            const content = this.filesystemUtil.readFile(filePath, encoding);

            if (!content) {
                throw new Error(
                    `The file at path ${filePath} has no readable content`
                );
            }

            const response = await this.octokit.git.createBlob({
                owner: repository.owner.login,
                repo: repository.name,
                content,
                encoding
            });

            return response.data;
        } catch (e) {
            this.logger.error(
                `[${GithubUtil.CLASS_NAME}.createBlobForFile]`,
                `Failed to create file blob for ${filePath}\n`,
                e
            );
            throw e;
        }
    }

    /**
     * A multi purpose uploader function.
     *
     * Can upload at a sub-directory level (create a tree that is relative to a parent tree). Good for adding and modfying files
     * or
     * Upload at the root tree (make commits like renaming and deleting file)
     *
     * To upload at the root tree, provide a composite object containing a file descriptor and the tree it belongs to for further processing.
     *
     * @param uploadDirPath
     * @param repository
     * @param commitMessage A message for this commit
     * @param ref
     * @param fileDescriptorWithTree An object containing the file descriptor and git tree it belongs to
     * @param options Additional options for the upload process
     */
    public async uploadToRepository(
        uploadDirPath: string,
        repository: GitHubRepository,
        commitMessage: string,
        ref = `heads/master`,
        fileDescriptorWithTree?: GitTreeWithFileDescriptor,
        options: Readonly<{
            /**
             * Should be set to false if the fileDescriptorWithTree contains a tree that was NOT fetched recursively
             */
            removeSubtrees: boolean;
            globOptions?: GlobOptions;
        }> = {
            removeSubtrees: true
        }
    ): Promise<GitReference> {
        this.logger.debug(
            `[${GithubUtil.CLASS_NAME}.uploadToRepository]`,
            `Uploading to ${repository.name} <${ref}> from ${uploadDirPath}`
        );

        // https://stackoverflow.com/questions/31563444/rename-a-file-with-github-api
        // https://levibotelho.com/development/commit-a-file-with-the-github-api
        let modifiedDescriptorWithTree: GitTreeWithFileDescriptor | undefined;
        if (fileDescriptorWithTree && options?.removeSubtrees) {
            modifiedDescriptorWithTree = {
                ...fileDescriptorWithTree,
                tree: {
                    ...fileDescriptorWithTree.tree,
                    tree: _filter(
                        fileDescriptorWithTree.tree.tree,
                        (treeItem) => {
                            return treeItem.type !== 'tree';
                        }
                    )
                }
            };
        }

        const currentCommit: CurrentCommitSha = await this.getCurrentCommit(
            repository,
            ref
        );

        const filePaths = await this.filesystemUtil.createGlobFromPath(
            uploadDirPath,
            options.globOptions
        );

        const fileBlobs = await Promise.all(
            filePaths.map((filePath) =>
                this.createBlobForFile(repository, filePath)
            )
        );

        const pathsForBlobs = filePaths.map((filePath) => {
            return this.filesystemUtil.createRelativePath(
                uploadDirPath,
                filePath
            );
        });

        this.logger.debug(
            `[${GithubUtil.CLASS_NAME}.uploadToRepository]`,
            `Uploading the following files\n${pathsForBlobs
                .map((path, index) => {
                    return `[${index + 1}] ${path}`;
                })
                .join('\n')}`
        );

        const newTree = await this.createNewTree(
            repository,
            fileBlobs,
            pathsForBlobs,
            modifiedDescriptorWithTree?.tree,
            currentCommit.treeSha,
            {
                referenceDescriptors: fileDescriptorWithTree?.descriptors
            }
        );

        this.logger.debug(
            `[${GithubUtil.CLASS_NAME}.uploadToRepository]`,
            `New tree created\n`,
            JSON.stringify(newTree, undefined, 4)
        );

        const newCommit = await this.createCommit(
            repository,
            commitMessage,
            newTree.sha,
            currentCommit.commitSha
        );

        this.logger.debug(
            `[${GithubUtil.CLASS_NAME}.uploadToRepository]`,
            `New commit created by ${newCommit.author.name} <${newCommit.author.email}>\n`,
            JSON.stringify(newCommit, undefined, 4)
        );

        const commitBranchResponse = await this.setCommmitBranch(
            repository,
            newCommit.sha,
            ref
        );

        this.logger.debug(
            `[${GithubUtil.CLASS_NAME}.uploadToRepository]`,
            `New commit pushed to ${ref} by ${newCommit.author.name} <${newCommit.author.email}>\n`,
            JSON.stringify(commitBranchResponse, undefined, 4)
        );

        return commitBranchResponse;
    }

    /**
     * Gets referrence details for the given repository
     * @param repository The repository
     * @param reference The reference to search for. Must be formated as "heads/branch_name" for branches or "tags/tag_name" for tags
     */
    public async getReference(
        repository: GitHubRepository,
        reference: string
    ): Promise<GitReference> {
        if (!reference.match(/^(heads|tags)\/\S+$/g)) {
            this.logger.error(
                `[${GithubUtil.CLASS_NAME}.getReference]`,
                `The given reference "${reference}" does not have the correct format of either "heads/<branch_name>" or "tags/<tag_name>"`
            );

            throw new Error(`Invalid reference`);
        }

        try {
            const result = await this.octokit.git.getRef({
                owner: repository.owner.login,
                repo: repository.name,
                ref: reference
            });

            if (result.status !== 200) {
                throw new Error(
                    `Non successful status code while getting ${reference} - ${result.status}`
                );
            }

            return result.data;
        } catch (e) {
            this.logger.error(
                `[${GithubUtil.CLASS_NAME}.getReference]`,
                `Could not obtain reference "${reference}" from ${repository.name}\n`,
                e
            );
            throw e;
        }
    }

    /**
     *
     * @param repositoryTree The repository tree
     * @param name
     * @returns
     */
    public static getFileDescriptorFromTree(
        repositoryTree: GitTree,
        name: string
    ): GitTreeItem | undefined {
        const { tree } = repositoryTree;

        const match = tree.find((item) => {
            if (item.path === name && item.type === 'blob') {
                return item;
            }
        });

        return match;
    }

    /**
     * Gets a list of files (with type blob) from a given tree
     * @param repositoryTree The tree to filter
     * @returns
     */
    public static getFilePathsFromTree(repositoryTree: GitTree): Array<string> {
        const { tree } = repositoryTree;
        const filePaths: Array<string> = [];

        tree.forEach((item) => {
            if (item.path && item.type === 'blob') {
                filePaths.push(item.path);
            }
        });

        return filePaths;
    }

    /**
     * Gets a list of subfolders (with type tree) from a given tree
     * @param repositoryTree The tree to filter
     * @returns
     */
    public static getSubfoldersFromTree(
        repositoryTree: GitTree
    ): Array<string> {
        const { tree } = repositoryTree;
        const subfolders: Array<string> = [];

        tree.forEach((item) => {
            if (item.path && item.type === 'tree') {
                subfolders.push(item.path);
            }
        });

        return subfolders;
    }

    /**
     * Obtains the file content as a string based on its size.
     *
     * @param repository The repository where the file is in
     * @param fileDescriptor The descriptor for the file
     * @param options Additional options for fetching the file
     * @returns
     */
    public async getFileDescriptorContent(
        repository: GitHubRepository,
        fileDescriptor: GitTreeItem,
        options: GetContentOptions | GetBlobOptions = {
            ref: `heads/${repository.default_branch}`,
            encoding: 'utf-8'
        }
    ) {
        if (!repository.owner.login) {
            throw new Error(`The repository provided does not have a name`);
        }

        let fileContent: string;

        const size = GithubUtil.bytesToSize(fileDescriptor.size);
        const { path: filePath } = fileDescriptor;

        if (size.measure === 'MB' && size.value > 1 && fileDescriptor.sha) {
            fileContent = await this.getBlob(
                repository,
                fileDescriptor.sha,
                options
            );
        } else {
            if (!filePath) {
                throw new Error(
                    `The file descriptor did not contain a usable path`
                );
            }

            fileContent = await this.getContent(
                repository,
                filePath.startsWith('./')
                    ? filePath.replace('./', '')
                    : filePath.startsWith('/')
                    ? filePath.replace('/', '')
                    : filePath,
                options
            );
        }

        return fileContent;
    }

    /**
     * Gets raw file content at the specified path from the repository.
     * Supports files up to 1MB in size
     * @param owner
     * @param repository
     * @param path
     * @param options
     * @returns
     */
    public async getContent(
        repository: GitHubRepository,
        path: string,
        options: GetContentOptions = {
            ref: `heads/master`,
            encoding: 'utf8'
        }
    ): Promise<string> {
        try {
            const response = await this.octokit.repos.getContent({
                path,
                repo: repository.name,
                owner: repository.owner.login,
                ref: options?.ref
            });

            if (response.status !== 200) {
                this.logger.error(
                    `[${GithubUtil.CLASS_NAME}.getContent]`,
                    `Read fail for ${path} in ${repository.name} <${options?.ref}> [code: ${response.status}]`
                );

                throw new Error(
                    `[${response.status}] ${response.url} [${response.data}]`
                );
            }

            const { content, encoding } = response.data as FileItem;
            const buffer = Buffer.from(content, encoding as BufferEncoding);
            const fileContent = buffer.toString(options?.encoding ?? 'utf8');

            this.logger.debug(
                `[${GithubUtil.CLASS_NAME}.getContent]`,
                `Read ${path} in ${repository.name} <${options?.ref}>`
            );

            return fileContent;
        } catch (e) {
            this.logger.error(
                `[${GithubUtil.CLASS_NAME}.getContent]`,
                `${path} does not exist/cannot be read in ${repository.name}\n`,
                e
            );

            throw e;
        }
    }

    /**
     *
     * @param repository
     * @param path
     * @param options
     * @returns
     */
    public async listDirectoryFilesInRepo(
        repository: GitHubRepository,
        path: string
    ): Promise<Array<FileItem>> {
        const directoryListing: Array<FileItem> = [];

        try {
            const response = await this.octokit.repos.getContent({
                path,
                owner: repository.owner.login,
                repo: repository.name
            });

            if (response.status !== 200) {
                throw new Error(
                    `[${response.status}] ${response.url} [${response.data}]`
                );
            }

            (response.data as DirectoryListing).forEach((value) => {
                directoryListing.push(value as FileItem);
            });
        } catch (e) {
            this.logger.error(
                `[${GithubUtil.CLASS_NAME}.listDirectoryFilesInRepo]`,
                `${path} does not exist/cannot be read in ${repository.name}\n`,
                e
            );
        }

        return directoryListing;
    }

    /**
     * Gets content as blob from the repository
     * @param repository
     * @param file_sha
     */
    public async getBlob(
        repository: GitHubRepository,
        file_sha: string,
        options?: GetBlobOptions
    ): Promise<string> {
        try {
            const response = await this.octokit.git.getBlob({
                owner: repository.owner.login,
                repo: repository.name,
                file_sha
            });

            if (response.status !== 200) {
                throw new Error(
                    `[${response.status}] ${response.url} [${response.data}]`
                );
            }

            const { content, encoding } = response.data as BlobItem;
            const buffer = Buffer.from(content, encoding as BufferEncoding);
            const fileContent = buffer.toString(options?.encoding ?? 'utf8');
            return fileContent;
        } catch (e) {
            this.logger.error(
                `[${GithubUtil.CLASS_NAME}.getBlob]`,
                `${file_sha} cannot be read in ${repository.name}\n`,
                e
            );
            throw e;
        }
    }

    /**
     * Search the given repository for a list of file path on the specified ref
     * @param repository The repository where the file path will be searched
     * @param filePaths A list of file paths to search for (e.g. /etc/v1/foo.json, ./eslintrc, ./src/v1/utils/path.ts)
     * @param ref The git ref (e.g. heads/master), will fallback to use the repository default branch if not specified
     * @param recursive Should the search be done for all sub trees of the repositories trees.
     * @returns
     */
    public async findTreeAndDescriptorForFilePath(
        repository: GitHubRepository,
        filePaths: Array<string>,
        ref = `heads/${repository.default_branch}`,
        recursive?: boolean
    ): Promise<GitTreeWithFileDescriptor | undefined> {
        const fileDescriptors: Array<GitTreeItem> = [];

        try {
            if (!repository.owner.login) {
                throw new Error(
                    `The repository ${repository.name} does not have an owner!`
                );
            }

            const repositoryTree = await this.getRepositoryGitTree(
                repository,
                ref,
                recursive
            );

            for (const filePath of filePaths) {
                const { tree } = repositoryTree;

                const fileDescriptor = this.findMatchingDescriptor(
                    tree,
                    'blob',
                    filePath
                );

                if (!fileDescriptor) {
                    throw new Error(
                        `No such file ${filePath} found in ${repository.name}`
                    );
                }

                fileDescriptors.push(fileDescriptor);
            }

            return {
                tree: repositoryTree,
                descriptors: fileDescriptors
            };
        } catch (e) {
            this.logger.warn(
                `[${GithubUtil.CLASS_NAME}.findTreeAndDescriptorForFilePath]`,
                `Skipping ${repository.name}\n`,
                e
            );

            return undefined;
        }
    }

    /**
     * Create a repository in the given organization.
     *
     * @param opts Options for the repository that will be created
     * @returns
     */
    public async createRepository(
        opts: Parameters<typeof this.octokit.repos.createInOrg>[0]
    ): Promise<
        UnpackedPromise<
            ReturnType<typeof this.octokit.repos.createInOrg>
        >['data']
    > {
        try {
            const response = await this.octokit.repos.createInOrg(opts);

            if (response.status > 299) {
                throw new Error(`Failed to create repository ${opts?.name}`);
            }

            return response.data;
        } catch (e) {
            this.logger.error(
                `${GithubUtil.CLASS_NAME}.createRepository`,
                `Failed to create the repository ${opts?.name}.\n`,
                e
            );
            throw e;
        }
    }

    public async setCommmitBranch(
        repository: GitHubRepository,
        commitSha: string,
        ref = `heads/master`
    ): Promise<GitReference> {
        try {
            const response = await this.octokit.git.updateRef({
                owner: repository.owner.login,
                repo: repository.name,
                ref,
                sha: commitSha
            });

            return response.data;
        } catch (e) {
            this.logger.warn(
                `[${GithubUtil.CLASS_NAME}.setCommmitBranch]`,
                `Failed to set commit branch for ${repository.name} <${ref}>\n`,
                e
            );

            throw e;
        }
    }

    /**
     * Shallow level searching of a Git Tree.
     * This will only search the given Git Tree object. If the tree is truncated, the search may yield a false negative.
     * Use the GitTreeHierarchy search for a comprehensive and exhaustive search.
     *
     * @param treeToSearch The tree to search through
     * @param typeToSearchFor Search for blobs or trees
     * @param descriptorToMatch The descriptor to match (the file path)
     * @returns
     */
    public findMatchingDescriptor(
        treeToSearch: GitTree['tree'] | FlattenedGitTree['tree'],
        typeToSearchFor: 'blob' | 'tree',
        descriptorToMatch: string
    ): GitTreeItem | undefined {
        this.logger.info(
            `[${GithubUtil.CLASS_NAME}.findMatchingDescriptor]`,
            `Checking tree for descriptor paths matching ${descriptorToMatch}`
        );

        const match = _chain(treeToSearch)
            .filter(({ type }) => {
                return type === typeToSearchFor;
            })
            .find(({ path }) => {
                if (path) {
                    if (path === descriptorToMatch) {
                        this.logger.debug(
                            `[${GithubUtil.CLASS_NAME}.findMatchingDescriptor]`,
                            `Found descriptor path ${path} that matches user supplied path ${descriptorToMatch}`
                        );
                        return true;
                    }

                    return false;
                }
                return false;
            })
            .value();

        return match;
    }

    /**
     *
     * @param repository The repository to download
     * @param ref The git reference to use for downloading the repository
     * @param downloadPath The full path to where the file will be saved
     * @param options Instructions on what to do when the file path for the repo already exists in the local system. Options are to either skip existing (default behavior) or overwrite existing.
     */
    public async downloadRepository(
        repository: GitHubRepository,
        downloadPath?: string,
        ref = `heads/${repository.default_branch}`,
        options: Readonly<{
            /**
             * Skip saving the repository to the path if it already exists
             */
            skipExisting?: boolean;
            /**
             * Overwrite the existing repository at the given path
             */
            overwriteExisting?: boolean;
            /**
             * Extract the package after downloaded
             */
            extractDownload?: boolean;
        }> = {
            overwriteExisting: false,
            skipExisting: true,
            extractDownload: false
        }
    ): Promise<void> {
        let response: UnpackedPromise<
            ReturnType<typeof this.octokit.repos.downloadTarballArchive>
        >;

        try {
            response = await this.octokit.repos.downloadTarballArchive({
                owner: repository.owner.login,
                ref,
                repo: repository.name
            });
        } catch (e) {
            this.logger.error(
                `[${GithubUtil.CLASS_NAME}.downloadRepository]`,
                `Failed to download tarball for ${repository.name}\n`,
                e
            );

            throw e;
        }

        if (downloadPath) {
            if (options.overwriteExisting ?? false) {
                if (this.filesystemUtil.doesFolderExist(downloadPath)) {
                    this.logger.debug(
                        `[${GithubUtil.CLASS_NAME}.downloadRepository]`,
                        `Replacing contents of ${repository.full_name} at existing path ${downloadPath}`
                    );

                    this.filesystemUtil.removeDirectory(downloadPath, {
                        recursive: true,
                        force: true
                    });

                    this.filesystemUtil.createFolder(downloadPath);
                }
            } else if (options.skipExisting ?? true) {
                if (this.filesystemUtil.doesFolderExist(downloadPath)) {
                    this.logger.debug(
                        `[${GithubUtil.CLASS_NAME}.downloadRepository]`,
                        `Skip downloading ${repository.full_name} as it already exists at path ${downloadPath}`
                    );

                    return;
                }
            }
        }

        try {
            if (!downloadPath) {
                this.logger.info(
                    `[${GithubUtil.CLASS_NAME}.downloadRepository]`,
                    `Skip saving download to local file system`
                );

                return;
            }

            this.logger.debug(
                `[${GithubUtil.CLASS_NAME}.downloadRepository]`,
                `Will download tarball to ${downloadPath}`
            );

            const parsedContentDisposition = (
                await import('content-disposition-header')
            ).parse(response.headers['content-disposition'] as string);

            const fileName = parsedContentDisposition.parameters['filename'];
            const filePath = `${downloadPath}/${fileName}`;

            this.filesystemUtil.writeFileFromBuffer(
                filePath,
                Buffer.from(response.data as ArrayBuffer)
            );

            if (!options.extractDownload) {
                return;
            }

            this.logger.debug(
                `[${GithubUtil.CLASS_NAME}.downloadRepository]`,
                `Extracting tarball at ${downloadPath}`
            );

            if (!response.headers['content-disposition']) {
                throw new Error('Missing required content-disposition header');
            }

            await this.tarUtil.extract(filePath, downloadPath, {});
        } catch (e) {
            this.logger.error(
                `[${GithubUtil.CLASS_NAME}.downloadRepository]`,
                `Cannot extract ${repository.name}\n`,
                e
            );

            throw e;
        }
    }

    /**
     * Measures bytes and returns a result quantifying that measure
     * @param bytes
     * @returns
     */
    public static bytesToSize(
        bytes?: number,
        decimals = 2
    ): Readonly<{
        value: number;
        measure: 'Bytes' | 'KB' | 'MB' | 'GB' | 'TB';
    }> {
        if (!bytes || bytes === 0)
            return {
                value: 0,
                measure: 'Bytes'
            };
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes: Array<'Bytes' | 'KB' | 'MB' | 'GB' | 'TB'> = [
            'Bytes',
            'KB',
            'MB',
            'GB',
            'TB'
        ];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return {
            value: parseFloat((bytes / Math.pow(k, i)).toFixed(dm)),
            measure: sizes[i]
        };
    }

    /**
     * Determines if the given object is a GitTreeItem
     * @param value The value to be tested to determine if it is a Git Tree Item
     * @returns
     */
    public static isGitTreeItem(value: unknown): value is GitTreeItem {
        if (!value) return false;
        if (typeof value !== 'object') return false;
        if (Array.isArray(value)) return false;
        const { type, path } = value as GitTreeItem;
        if (typeof type !== 'undefined' && typeof path !== 'undefined')
            return true;
        return false;
    }

    /**
     * Determines if the given object is a GitTreeItemWithGitTree tuple
     * @param value The value to be tested to determine if it is a GitTreeItem with a GitTree hierarchy tuple
     * @returns
     */
    public static isGitTreeItemWithGitTree(
        value: unknown
    ): value is GitTreeItemWithGitTree {
        if (!value) return false;
        if (!Array.isArray(value)) return false;
        if (value.length !== 2) return false;
        const [item, tree] = value;
        if (!GithubUtil.isGitTreeItem(item)) return false;
        const { sha, tree: theTree } = tree as GitTreeHierachy;
        if (typeof sha !== 'undefined' && typeof theTree !== 'undefined')
            return true;
        return false;
    }

    /**
     * Recursively search through a Git Tree Hierarchy to find the specified file path.
     *
     * The return response will contain the descriptor, which is an object containing metadata about the file that was found, the tree object containing the file, if it was found, and an array of all Git Tree SHAs traversed to reach the file. The immediate parent folder of the file can be found the last SHA in the array.
     *
     * @param path An array representing the path to search for
     * @param hierarchy The git tree hierarchy to search through
     * @returns
     */
    public static findInGitTreeHierarchy(
        path: Array<string>,
        hierarchy: GitTreeHierachy,
        treePathSha: Array<string> = []
    ): Readonly<{
        treePathSha: Array<string>;
        tree: GitTreeHierachy;
        descriptor?: GitTreeItem;
    }> {
        const { tree } = hierarchy;

        const pathElement = path.shift();

        if (!pathElement)
            throw new Error(`The path ${path} was not found in tree`);

        if (path.length === 0) {
            const candidates = _filter(tree, GithubUtil.isGitTreeItem);

            if (!candidates) {
                throw new Error(
                    `The file ${pathElement} was not found in tree`
                );
            }

            const match = candidates.find(
                (treeItem) => treeItem.path === pathElement
            );

            if (!match) {
                throw new Error(
                    `The file ${pathElement} was not found in tree`
                );
            }

            treePathSha.pop();

            return {
                treePathSha,
                tree: hierarchy,
                descriptor: match
            };
        } else {
            const candidates = _filter(
                tree,
                GithubUtil.isGitTreeItemWithGitTree
            );

            if (!candidates) {
                throw new Error(
                    `The path ${pathElement}/${path.join(
                        '/'
                    )} was not found in tree`
                );
            }

            const match = candidates.find(
                ([childTreeItemDescriptor]) =>
                    childTreeItemDescriptor.path === pathElement
            );

            if (!match) {
                throw new Error(
                    `No match found for ${pathElement}/${path.join(
                        '/'
                    )} in tree`
                );
            }

            treePathSha.push(match[1].sha);

            return GithubUtil.findInGitTreeHierarchy(
                path,
                match[1],
                treePathSha
            );
        }
    }

    public static flattenGitTreeHierarchy(
        hierarchy: GitTreeHierachy,
        allItems: Array<EnrichedGitTreeItem> = [],
        paths: Array<string> = []
    ): FlattenedGitTree {
        const { tree, ...attrs } = hierarchy;

        for (const item of tree) {
            if (GithubUtil.isGitTreeItem(item)) {
                allItems.push({
                    ...item,
                    path: `${paths.length ? `${paths.join('/')}/` : ''}${
                        item.path
                    }`,
                    treeSha: attrs.sha
                });
            } else {
                const [nestedTreeDescriptor, nestedTree] = item;

                nestedTreeDescriptor.path &&
                    paths.push(nestedTreeDescriptor.path);

                for (const nestedItem of nestedTree.tree) {
                    if (GithubUtil.isGitTreeItem(nestedItem)) {
                        allItems.push({
                            ...nestedItem,
                            path: `${
                                paths.length ? `${paths.join('/')}/` : ''
                            }${nestedItem.path}`,
                            treeSha: nestedTreeDescriptor.sha
                        });
                    } else {
                        const [deepTreeDescriptor, deepTree] = nestedItem;

                        deepTreeDescriptor.path &&
                            paths.push(deepTreeDescriptor.path);

                        this.flattenGitTreeHierarchy(deepTree, allItems, paths);

                        paths.pop();
                    }
                }

                nestedTreeDescriptor.path && paths.pop();
            }
        }

        return {
            ...attrs,
            tree: allItems
        };
    }
}

/**
  node --no-warnings --experimental-specifier-resolution=node --experimental-modules --loader ts-node/esm src/utils/github.util.ts
 */

// (async () => {
//     const { LoggerUtil, LogLevel } = await import('./logger.util');
//     const { FilesystemUtil } = await import('./filesystem.util');
//     const { ConfigUtil } = await import('./config.util');
//     const { TarUtil } = await import('./tar.util');

//     const logger = new LoggerUtil(LogLevel.DEBUG, 'test');

//     const gitUtil = new GithubUtil({
//         logger,
//         filesystemUtil: new FilesystemUtil({ logger }),
//         configUtil: new ConfigUtil({ logger }),
//         tarUtil: new TarUtil({ logger })
//     });

//     const [repository] = await gitUtil.listRepositoriesForOrganization('c9', {
//         onlyInclude: 'c9-upload-api'
//     });

//     await gitUtil.downloadRepository(
//         repository,
//         '/home/ln0/gitops/c9/c9-upload-api',
//         'heads/master',
//         {
//             extractDownload: true,
//             overwriteExisting: true
//         }
//     );
// })();

// (async () => {
//     const { LoggerUtil, LogLevel } = await import('./logger.util');
//     const { FilesystemUtil } = await import('./filesystem.util');
//     const { writeFileSync } = await import('fs');

//     const logger = new LoggerUtil(LogLevel.DEBUG, 'test');

//     const gitUtil = new GithubUtil({
//         logger,
//         filesystemUtil: new FilesystemUtil({ logger })
//     });

//     const [repository] = await gitUtil.listRepositoriesForOrganization('foo', {
//         onlyInclude: 'foo-service'
//     });

//     console.log(repository);

// const ref = `heads/${repository.default_branch}`;

// writeFileSync(
//     `__mocks__/GitRepository.json`,
//     JSON.stringify(repository, undefined, 4)
// );

// const gitReference = await gitUtil.getReference(repository, ref);

// writeFileSync(
//     `__mocks__/GitReference.json`,
//     JSON.stringify(gitReference, undefined, 4)
// );

// const gitTree = await gitUtil.getTree(repository, ref);

// writeFileSync(
//     `__mocks__/GitTree.json`,
//     JSON.stringify(gitTree, undefined, 4)
// );

// const gitTreeHierachy = await gitUtil.getRepositoryFullGitTree(
//     repository,
//     ref
// );

// writeFileSync(
//     `__mocks__/GitTreeHierachy.json`,
//     JSON.stringify(gitTreeHierachy, undefined, 4)
// );

// const pathParts = FilesystemUtil.getPathParts(
//     'src\\v1\\DOCUMENTATION_V1.md'
// );

// const match = GithubUtil.findInGitTreeHierarchy(pathParts, gitTreeHierachy);

// writeFileSync(
//     `__mocks__/FindInGitTreeHierarchy.json`,
//     JSON.stringify(match, undefined, 4)
// );

// const flattenedGitTreeHierachy = await gitUtil.getRepositoryFullGitTree(
//     repository,
//     ref,
//     true
// );

// writeFileSync(
//     `__mocks__/FlattenedGitTreeHierachy.json`,
//     JSON.stringify(flattenedGitTreeHierachy, undefined, 4)
// );
// })();
