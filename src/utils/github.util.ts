import os from 'os';
import _ from 'lodash';

import { Octokit, RestEndpointMethodTypes } from '@octokit/rest';
import { operations, components } from '@octokit/openapi-types';

import { Agent } from 'https';
import { FilesystemUtils } from './filesystem.util';
import { LoggerUtil, LogLevel } from './logger.util';

export type GitHubRepository = components['schemas']['minimal-repository'];

export type RespositoryFile = FileItem;

export type GitTreeWithFileDescriptor = Readonly<{
    tree: GitTree;
    descriptor: GitTreeItem;
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

export type GithubUtilsOptions = Readonly<{
    githubToken?: string;
    tokenFilePath?: string;
    baseDir?: string;
    logger: LoggerUtil;
    filesystemUtils: FilesystemUtils;
}>;

export type CurrentCommitSha = Readonly<{
    commitSha: string;
    treeSha: string;
}>;

export class GithubUtils {
    private static readonly CLASS_NAME = 'GithubUtils';

    public static GITHUB_TOKEN_PATH = 'c9-cli-token.txt';
    public static GITHUB_API_BASE_PATH =
        'https://github.devops.topdanmark.cloud/api/v3';

    private readonly baseDir: string | undefined;
    private readonly octokit: Octokit;
    private readonly logger: LoggerUtil;
    private readonly filesystemUtils: FilesystemUtils;

    constructor(options: GithubUtilsOptions) {
        this.logger = options.logger;

        this.filesystemUtils = options.filesystemUtils;

        this.baseDir = options?.baseDir;

        this.octokit = new Octokit({
            auth:
                options?.githubToken ??
                this.filesystemUtils.readFile(
                    `${os.homedir()}/${
                        options?.tokenFilePath ?? GithubUtils.GITHUB_TOKEN_PATH
                    }`
                ),
            baseUrl: GithubUtils.GITHUB_API_BASE_PATH,
            request: { agent: new Agent({ rejectUnauthorized: false }) }
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
                onlyInclude: string;
            }>
        > = {
            includeForks: false,
            includeArchived: false,
            includeDisabled: false
        }
    ): Promise<Array<GitHubRepository>> {
        const repositories: Array<GitHubRepository> = [];

        try {
            for await (const response of this.octokit.paginate.iterator(
                this.octokit.rest.repos.listForOrg,
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
                        if (options.onlyInclude) {
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
                `[${GithubUtils.CLASS_NAME}.listRepositoriesForOrganization]`,
                `Could not list repositories for ${organization}`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
            );

            throw e;
        }
    }

    /**
     * Gets the root tree for the given repository
     * @param repository The repository name
     * @param ref The reference to search for. Must be formated as "heads/branch_name" for branches or "tags/tag_name" for tags
     * @param recursive Should all subtree's be returned as well
     */
    public async getRepositoryGitTree(
        repository: GitHubRepository,
        ref = 'heads/master',
        recursive?: boolean
    ): Promise<GitTree> {
        try {
            const reference = await this.getReference(repository, ref);

            if (!reference) {
                throw new Error(
                    `No reference found in ${repository.full_name}: <${ref}>`
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
                `[${GithubUtils.CLASS_NAME}.getRepositoryGitTree]`,
                `Could not get repository tree with ref ${ref} for ${repository.full_name}`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
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
                this.octokit.rest.repos.listReleases,
                {
                    owner: repository.owner.login,
                    repo: repository.name,
                    ...(options && options)
                }
            )) {
                response.data.map((release) => {
                    tags.push(release.tag_name);
                });
            }

            return tags;
        } catch (e) {
            this.logger.error(
                `[${GithubUtils.CLASS_NAME}.listReleaseTags]`,
                `Could not list release tags for ${repository.full_name}`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
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
                `[${GithubUtils.CLASS_NAME}.listLastReleaseTag]`,
                `Could not list the last release tag for ${repository.full_name}`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
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
                `[${GithubUtils.CLASS_NAME}.listLast50ReleaseTags]`,
                `Could not list the last 50 release tags for ${repository.full_name}`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
            );

            throw e;
        }
    }

    /**
     * Obtains the tree details based on the given tree SHA.
     * @param repository The repository
     * @param tree_sha The tree SHA obtained from the {@linkcode GithubUtils.getCommit} function
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

            return result.data;
        } catch (e) {
            this.logger.error(
                `[${GithubUtils.CLASS_NAME}.getTree]`,
                `Could not obtain tree "${tree_sha}" from ${repository.full_name}`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
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
     * @returns
     */
    public async createNewTree(
        repository: GitHubRepository,
        blobs: Array<ShortBlob>,
        paths: Array<string>,
        tree?: GitTree,
        parentTreeSha?: string
    ): Promise<GitTree> {
        type CreateTree = UnpackedArray<
            operations['git/create-tree']['requestBody']['content']['application/json']['tree']
        >;

        const mappedBlobs: Array<CreateTree> = blobs.map(({ sha }, index) => {
            return {
                mode: '100644',
                type: 'blob',
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
        ref = 'heads/master'
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
     * @param commit_sha The commit SHA obtained from the {@linkcode GithubUtils.getReference} function
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
                `[${GithubUtils.CLASS_NAME}.getCommit]`,
                `Could not obtain commit "${commit_sha}" from ${repository.full_name}\n`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
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
                `[${GithubUtils.CLASS_NAME}.createCommit]`,
                `Failed to create a new commit for ${repository.full_name} with the given tree SHA ${treeSHA} and commit SHA ${commitSHA}\n`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
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
            const content = this.filesystemUtils.readFile(filePath, encoding);

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
                `[${GithubUtils.CLASS_NAME}.createBlobForFile]`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
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
     * @param commitMessage
     * @param ref
     * @param fileDescriptorWithTree An object containing the file descriptor and git tree it belongs to
     */
    public async uploadToRepository(
        uploadDirPath: string,
        repository: GitHubRepository,
        commitMessage: string,
        ref = 'heads/master',
        fileDescriptorWithTree?: GitTreeWithFileDescriptor
    ) {
        this.logger.debug(
            `[${GithubUtils.CLASS_NAME}.uploadToRepository]`,
            `Uploading to ${repository.full_name} <${ref}> from ${uploadDirPath}`
        );

        // https://stackoverflow.com/questions/31563444/rename-a-file-with-github-api
        // https://levibotelho.com/development/commit-a-file-with-the-github-api
        let modifiedDescriptorWithTree: GitTreeWithFileDescriptor | undefined;
        if (fileDescriptorWithTree) {
            modifiedDescriptorWithTree = {
                ...fileDescriptorWithTree,
                tree: {
                    ...fileDescriptorWithTree.tree,
                    tree: _.filter(
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

        const filePaths = await this.filesystemUtils.createGlobFromPath(
            uploadDirPath
        );

        const fileBlobs = await Promise.all(
            filePaths.map((filePath) =>
                this.createBlobForFile(repository, filePath)
            )
        );

        const pathsForBlobs = filePaths.map((filePath) => {
            return this.filesystemUtils.createRelativePath(
                uploadDirPath,
                filePath
            );
        });

        this.logger.debug(
            `[${GithubUtils.CLASS_NAME}.uploadToRepository]`,
            `Uploading the following files`,
            JSON.stringify(pathsForBlobs, undefined, 4)
        );

        const newTree = await this.createNewTree(
            repository,
            fileBlobs,
            pathsForBlobs,
            modifiedDescriptorWithTree?.tree,
            currentCommit.treeSha
        );

        this.logger.debug(
            `[${GithubUtils.CLASS_NAME}.uploadToRepository]`,
            `New tree created`,
            JSON.stringify(newTree, undefined, 4)
        );

        const newCommit = await this.createCommit(
            repository,
            commitMessage,
            newTree.sha,
            currentCommit.commitSha
        );

        this.logger.debug(
            `[${GithubUtils.CLASS_NAME}.uploadToRepository]`,
            `New commit created by ${newCommit.author.name} <${newCommit.author.email}>`,
            JSON.stringify(newCommit, undefined, 4)
        );

        const commitBranchResponse = await this.setCommmitBranch(
            repository,
            ref,
            newCommit.sha
        );

        this.logger.debug(
            `[${GithubUtils.CLASS_NAME}.uploadToRepository]`,
            `New commit pushed to ${ref} by ${newCommit.author.name} <${newCommit.author.email}>`,
            JSON.stringify(commitBranchResponse, undefined, 4)
        );
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
                `[${GithubUtils.CLASS_NAME}.getReference]`,
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
                `[${GithubUtils.CLASS_NAME}.getReference]`,
                `Could not obtain reference "${reference}" from ${repository.full_name}`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
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
     * @param filePath The relative file path to this repo
     * @param options Additional options for fetching the file
     * @returns
     */
    public async getFileDescriptorContent(
        repository: GitHubRepository,
        filePath: string,
        fileDescriptor: GitTreeItem,
        options?: GetContentOptions | GetBlobOptions
    ) {
        if (!repository.owner.login) {
            throw new Error(`The repository provided does not have a name`);
        }

        let fileContent: string;

        const size = GithubUtils.bytesToSize(fileDescriptor.size);

        if (size.measure === 'MB' && size.value > 1 && fileDescriptor.sha) {
            fileContent = await this.getBlob(
                repository,
                fileDescriptor.sha,
                options
            );
        } else {
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
        options?: GetContentOptions
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
                    `[${GithubUtils.CLASS_NAME}.getContent]`,
                    `Read fail ${path} in ${repository.full_name} <${options?.ref}>`
                );

                throw new Error(
                    `[${response.status}] ${response.url} [${response.data}]`
                );
            }

            const { content, encoding } = response.data as FileItem;
            const buffer = Buffer.from(content, encoding as BufferEncoding);
            const fileContent = buffer.toString(options?.encoding ?? 'utf8');

            this.logger.debug(
                `[${GithubUtils.CLASS_NAME}.getContent]`,
                `Read ${path} in ${repository} <${options?.ref}>`
            );

            return fileContent;
        } catch (e) {
            this.logger.error(
                `[${GithubUtils.CLASS_NAME}.getContent]`,
                `${path} does not exist/cannot be read in ${repository.full_name}\n`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
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
                `[${GithubUtils.CLASS_NAME}.listDirectoryFilesInRepo]`,
                `${path} does not exist/cannot be read in ${repository.full_name}\n`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
            );
        }

        return directoryListing;
    }

    /**
     *
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
                `[${GithubUtils.CLASS_NAME}.getBlob]`,
                `${file_sha} cannot be read in ${repository.full_name}\n`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
            );
            throw e;
        }
    }

    /**
     * Search the given repository for a file path on the specified ref
     * @param repository The repository where the file path will be searched
     * @param filePath The file path to search for (e.g. /etc/v1/foo.json, ./eslintrc, ./src/v1/utils/path.ts)
     * @param ref The git ref (e.g. heads/master)
     * @param recursive Should the search be done for all sub trees of the repositories trees.
     * @returns
     */
    public async findTreeAndDescriptorForFilePath(
        repository: GitHubRepository,
        filePath: string,
        ref: string,
        recursive?: boolean
    ): Promise<GitTreeWithFileDescriptor | undefined> {
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

            const fileName = FilesystemUtils.getFileNameFromPath(filePath);

            const { tree } = repositoryTree;

            const fileDescriptor = this.findMatchingDescriptor(
                tree,
                'blob',
                fileName
            );

            if (!fileDescriptor) {
                throw new Error(
                    `No such file ${fileName} found at the root of ${repository.full_name}`
                );
            }

            return {
                tree: repositoryTree,
                descriptor: fileDescriptor
            };
        } catch (e) {
            this.logger.warn(
                `[${GithubUtils.CLASS_NAME}].findTreeAndDescriptorForFilePath`,
                `Skipping ${repository.full_name} due to an error\n`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
            );

            return undefined;
        }
    }

    public async setCommmitBranch(
        repository: GitHubRepository,
        ref = 'heads/master',
        commitSha: string
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
                `[${GithubUtils.CLASS_NAME}].setCommmitBranch`,
                `Failed to set commit branch for ${repository.full_name} <${ref}>\n`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
            );

            throw e;
        }
    }

    public findMatchingDescriptor(
        treeToSearch: GitTree['tree'],
        typeToSearchFor: 'blob' | 'tree',
        descriptorToMatch: string
    ): GitTreeItem | undefined {
        const match = _.chain(treeToSearch)
            .filter(({ type }) => {
                return type === typeToSearchFor;
            })
            .find(({ path }) => {
                if (path) {
                    return path.includes(descriptorToMatch);
                }
                return false;
            })
            .value();

        return match;
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
}
