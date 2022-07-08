import os from 'os';
import _ from 'lodash';

import { Octokit, RestEndpointMethodTypes } from '@octokit/rest';
import { components } from '@octokit/openapi-types';

import { Agent } from 'https';
import { FilesystemUtils } from './filesystem.util';
import { LoggerUtil, LogLevel } from './logger.util';

export type OrganizationRepository = Readonly<{
    name: string;
    fullName: string;
    archived: boolean;
    disabled: boolean;
    fork: boolean;
    ownerName?: string | null;
    repositoryUrl: string;
}>;

export type RepositoryTree = Tree;
export type RespositoryFile = FileItem;

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
type GitReference = components['schemas']['git-ref'];
type Commit = components['schemas']['git-commit'];
type Tree = components['schemas']['git-tree'];

export type GithubUtilsOptions = Readonly<{
    githubToken?: string;
    tokenFilePath?: string;
    baseDir?: string;
    logger: LoggerUtil;
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

        this.filesystemUtils = new FilesystemUtils({
            logger: this.logger
        });

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
    ): Promise<Array<OrganizationRepository>> {
        const repositories: Array<OrganizationRepository> = [];

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

                        repositories.push({
                            name: repository.name,
                            fullName: repository.full_name,
                            archived: repository.archived ? true : false,
                            disabled: repository.disabled ? true : false,
                            fork: repository.fork,
                            ownerName: repository.owner.login,
                            repositoryUrl: repository.html_url
                        });
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
     * @param owner The owner of the repository
     * @param ref The reference to search for. Must be formated as "heads/branch_name" for branches or "tags/tag_name" for tags
     */
    public async getRepositoryTree(
        repository: string,
        owner: string,
        ref = 'heads/master'
    ): Promise<RepositoryTree> {
        try {
            const reference = await this.getReference(repository, owner, ref);

            if (!reference) {
                throw new Error(
                    `No reference found for ref ${ref} in ${owner}/${repository}`
                );
            }

            const commit = await this.getCommit(
                repository,
                owner,
                reference.object.sha
            );

            if (!commit) {
                throw new Error(
                    `No commit found for reference object SHA ${reference.object.sha}`
                );
            }

            const tree = await this.getTree(repository, owner, commit.tree.sha);

            return tree;
        } catch (e) {
            this.logger.error(
                `[${GithubUtils.CLASS_NAME}.getRepositoryTree]`,
                `Could not get repository tree with ref ${ref} for ${owner}/${repository}`,
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
     * @param organization The Git organization where repositories will be searched for
     * @param repository The repository name
     * @param options
     * @returns
     */
    public async listReleaseTags(
        organization: string,
        repository: string,
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
                    owner: organization,
                    repo: repository,
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
                `Could not list release tags for ${organization}/${repository}`,
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
     * @param organization The Git organization where repositories will be searched for
     * @param repository The repository name
     * @returns
     */
    public async listLastReleaseTag(
        organization: string,
        repository: string
    ): Promise<string | undefined> {
        try {
            const tags: Array<string> = await this.listReleaseTags(
                organization,
                repository,
                {
                    page: 1,
                    per_page: 1
                }
            );

            return tags.length > 0 ? tags[0] : undefined;
        } catch (e) {
            this.logger.error(
                `[${GithubUtils.CLASS_NAME}.listLastReleaseTag]`,
                `Could not list the last release tag for ${organization}/${repository}`,
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
     * @param organization The Git organization where repositories will be searched for
     * @param repository The repository name
     * @returns
     */
    public async listLast50ReleaseTags(
        organization: string,
        repository: string
    ): Promise<Array<string>> {
        try {
            const tagNames: Array<string> = await this.listReleaseTags(
                organization,
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
                `Could not list the last 50 release tags for ${organization}/${repository}`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
            );

            throw e;
        }
    }

    /**
     * Obtains the tree details based on the given tree SHA.
     * @param repository The repository name
     * @param owner The owner of the repository
     * @param tree_sha The tree SHA obtained from the {@linkcode GithubUtils.getCommit} function
     * @returns
     */
    public async getTree(
        repository: string,
        owner: string,
        tree_sha: string
    ): Promise<Tree> {
        try {
            const result = await this.octokit.git.getTree({
                owner,
                repo: repository,
                tree_sha
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
                `Could not obtain tree "${tree_sha}" from ${owner}/${repository}`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
            );
            throw e;
        }
    }

    // public async createTree(repository: string, owner: string, baseTree: Tree) {
    //     try {
    //         await this.octokit.git.createTree({
    //             owner,
    //             repo: repository,
    //             base_tree: baseTree.sha
    //         });
    //     } catch (e) {}
    // }

    /**
     * Obtains the commit details based on the given commit SHA.
     * @param repository The repository name
     * @param owner The owner of the repository
     * @param commit_sha The commit SHA obtained from the {@linkcode GithubUtils.getReference} function
     * @returns
     */
    public async getCommit(
        repository: string,
        owner: string,
        commit_sha: string
    ): Promise<Commit> {
        try {
            const result = await this.octokit.git.getCommit({
                owner,
                repo: repository,
                commit_sha
            });

            if (result.status !== 200) {
                throw new Error(
                    `Non successful status code while getting "${commit_sha}" - ${result.status}`
                );
            }

            return result.data;
        } catch (e) {
            this.logger.error(
                `[${GithubUtils.CLASS_NAME}.getCommit]`,
                `Could not obtain commit "${commit_sha}" from ${owner}/${repository}`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
            );
            throw e;
        }
    }

    /**
     * Gets referrence details for the given repository
     * @param repository The repository name
     * @param owner The owner of the repository
     * @param reference The reference to search for. Must be formated as "heads/branch_name" for branches or "tags/tag_name" for tags
     */
    public async getReference(
        repository: string,
        owner: string,
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
                owner,
                repo: repository,
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
                `Could not obtain reference "${reference}" from ${owner}/${repository}`,
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
        repositoryTree: RepositoryTree,
        name: string
    ): UnpackedArray<RepositoryTree['tree']> | undefined {
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
    public static getFilePathsFromTree(
        repositoryTree: RepositoryTree
    ): Array<string> {
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
        repositoryTree: RepositoryTree
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
     * Gets raw file content at the specified path from the repository.
     * Supports files up to 1MB in size
     * @param owner
     * @param repository
     * @param path
     * @param options
     * @returns
     */
    public async getContent(
        owner: string,
        repository: string,
        path: string,
        options?: GetContentOptions
    ): Promise<string> {
        try {
            const response = await this.octokit.repos.getContent({
                path,
                repo: repository,
                owner,
                ref: options?.ref
            });

            if (response.status !== 200) {
                this.logger.error(
                    `[${GithubUtils.CLASS_NAME}.getContent]`,
                    `Expected read fail ${path} in ${repository} ref:${options?.ref}`
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
                `Read ${path} in ${repository} ref:${options?.ref}`
            );

            return fileContent;
        } catch (e) {
            this.logger.error(
                `[${GithubUtils.CLASS_NAME}.getContent]`,
                `${path} does not exist/cannot be read in ${repository}`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
            );

            throw e;
        }
    }

    /**
     *
     * @param owner
     * @param repository
     * @param path
     * @param options
     * @returns
     */
    public async listDirectoryFilesInRepo(
        owner: string,
        repository: string,
        path: string
    ): Promise<Array<FileItem>> {
        const directoryListing: Array<FileItem> = [];

        try {
            const response = await this.octokit.repos.getContent({
                path,
                repo: repository,
                owner
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
                `${path} does not exist/cannot be read in ${repository}`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
            );
        }

        return directoryListing;
    }

    /**
     *
     * @param owner
     * @param repository
     * @param file_sha
     */
    public async getBlob(
        owner: string,
        repository: string,
        file_sha: string,
        options?: GetBlobOptions
    ): Promise<string> {
        try {
            const response = await this.octokit.git.getBlob({
                repo: repository,
                owner,
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
                `${file_sha} cannot be read in ${owner}/${repository}`,
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
     * @returns
     */
    public async findTreeAndDescriptorForFilePath(
        repository: OrganizationRepository,
        filePath: string,
        ref: string
    ): Promise<
        | {
              tree: RepositoryTree;
              descriptor: UnpackedArray<RepositoryTree['tree']>;
          }
        | undefined
    > {
        try {
            if (!repository.ownerName) {
                throw new Error(
                    `The repository ${repository.name} does not have an owner!`
                );
            }

            const repositoryTree = await this.getRepositoryTree(
                repository.name,
                repository.ownerName,
                ref
            );

            const pathParts = filePath.split('/');
            const [fileName, ...directoryPaths] = pathParts.reverse();
            if (directoryPaths[directoryPaths.length - 1] === '.') {
                directoryPaths.pop();
            }
            const isFileAtRoot = directoryPaths.length === 0;
            const { tree: rootTree } = repositoryTree;

            if (isFileAtRoot) {
                const fileDescriptor = this.findMatchingDescriptor(
                    rootTree,
                    'blob',
                    fileName
                );

                if (!fileDescriptor) {
                    throw new Error(
                        `No such file ${fileName} found at the root of ${repository.ownerName}/${repository.name}`
                    );
                }

                return {
                    tree: repositoryTree,
                    descriptor: fileDescriptor
                };
            } else {
                const matchedTree = await this.findMatchingTreeRecursively(
                    repository,
                    repositoryTree,
                    _.filter(
                        directoryPaths.reverse(),
                        (value) => typeof value === 'string' && value.length > 0
                    )
                );

                if (!matchedTree) {
                    throw new Error(
                        `No such file ${fileName} found at the root of ${repository.ownerName}/${repository.name}`
                    );
                }

                const fileDescriptor = this.findMatchingDescriptor(
                    matchedTree.tree,
                    'blob',
                    fileName
                );

                if (!fileDescriptor) {
                    throw new Error(
                        `No such file ${fileName} found at given path /${directoryPaths
                            .reverse()
                            .join('/')}`
                    );
                }

                return {
                    tree: matchedTree,
                    descriptor: fileDescriptor
                };
            }
        } catch (e) {
            this.logger.warn(
                `[${GithubUtils.CLASS_NAME}]`,
                `Skipping ${repository.ownerName}/${repository.name} due to an error`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
            );

            return undefined;
        }
    }

    public async findMatchingTreeRecursively(
        repository: OrganizationRepository,
        treeToSearch: RepositoryTree,
        directoryPaths: Array<string>
    ): Promise<RepositoryTree | undefined> {
        if (!repository.ownerName) {
            throw new Error(
                `The repository ${repository.name} does not have an owner!`
            );
        }

        const treeItem = this.findMatchingDescriptor(
            treeToSearch.tree,
            'tree',
            directoryPaths[0]
        );

        if (!treeItem) {
            throw new Error(
                `The path ${directoryPaths[0]} does not exist in ${repository.ownerName}/${repository.name}`
            );
        }

        if (treeItem.type === 'tree') {
            if (!treeItem?.sha) {
                throw new Error(
                    `The tree item for ${directoryPaths[0]} does not have a usable SHA`
                );
            }

            directoryPaths.shift(); // Remove the first item from the array

            // Get the tree for this subdirectory
            const subTree = await this.getTree(
                repository.name,
                repository.ownerName,
                treeItem.sha
            );

            // If there's nothing else to search, then return the tree at this point
            if (directoryPaths.length === 0) {
                return subTree;
            }

            // Search the subdirectory tree
            return await this.findMatchingTreeRecursively(
                repository,
                subTree,
                directoryPaths
            );
        }
    }

    public findMatchingDescriptor(
        treeToSearch: RepositoryTree['tree'],
        typeToSearchFor: 'blob' | 'tree',
        descriptorToMatch: string
    ): UnpackedArray<RepositoryTree['tree']> | undefined {
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

// const utils = new GithubUtils();
// utils
//     .getReference('top-context', 'c9', 'heads/master')
//     .then(async (reference) => {
//         // console.log(reference);

//         if (reference) {
//             const commit = await utils.getCommit(
//                 'top-context',
//                 'c9',
//                 reference?.object.sha
//             );

//             // console.log(commit);

//             if (commit) {
//                 const tree = await utils.getTree(
//                     'top-context',
//                     'c9',
//                     commit?.tree.sha
//                 );

//                 const item = tree?.tree.find(
//                     (item) => item.path === 'package-lock.json'
//                 );

//                 console.log(item);

//                 if (item) {
//                     const packageLock = await utils.getBlob(
//                         'c9',
//                         'top-context',
//                         // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
//                         item.sha!
//                     );

//                     // console.log(packageLock);
//                 }
//             }
//         }
//     });
