import { WriteFileOptions, realpathSync } from 'fs';
import { relative, dirname, join } from 'path';
import os from 'os';
import fse from 'fs-extra';
import { LoggerUtil } from './logger.util';
import { fileURLToPath } from 'url';
import { globby, Options as GlobbyOptions } from 'globby';

const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __dirname = dirname(__filename);

export type FilesystemUtilsOptions = Readonly<{
    logger: LoggerUtil;
}>;

export type FilesystemWriteFileOptions = WriteFileOptions;

export type GlobOptions = GlobbyOptions;

export type ModuleConf = Readonly<{
    gitTokenFilePath?: string;
    gitApiBase?: string;
}>;

export class FilesystemUtil {
    private static readonly CLASS_NAME = 'FilesystemUtil';

    public static readonly TMP_DIR = '.tmp';

    public static readonly MODULE_CONF_FILE = `${os.homedir()}/.${
        process.env.MODULE_NAME
    }rc.json`;

    private readonly logger: LoggerUtil;

    constructor(options: FilesystemUtilsOptions) {
        this.logger = options.logger;
    }

    public readConfiguration(encoding: BufferEncoding = 'utf8'): ModuleConf {
        try {
            const json = fse.readJSONSync(FilesystemUtil.MODULE_CONF_FILE, {
                encoding
            });

            if (Object.keys(json).length === 0) {
                throw new Error();
            }

            return json as ModuleConf;
        } catch (e) {
            this.logger.info(
                `[${FilesystemUtil.CLASS_NAME}.readConfiguration]`,
                `No usable configuration file found at ${FilesystemUtil.MODULE_CONF_FILE}\n`
            );

            return {};
        }
    }

    /**
     * A simple synchronous file reader
     * @param filePath The path to the file to read
     * @param encoding The encoding of the file; defaults to utf8
     * @returns The file content as a string or undefined if the file was not found
     */
    public readFile(
        filePath: string,
        encoding: BufferEncoding = 'utf8'
    ): string | undefined {
        try {
            return fse.readFileSync(filePath, {
                encoding
            });
        } catch (e) {
            this.logger.error(
                `[${FilesystemUtil.CLASS_NAME}.readFile]`,
                `Failed to read file at ${filePath}\n`,
                e
            );
            return undefined;
        }
    }

    /**
     * Writes a JSON object to the file system at the given path.
     *
     * @example
     * ```typescript
     * (await new FilesystemUtil()).writeJsonFile(
     *     (await import('path')).join(__dirname, '/c9Repositories.json'),
     *      response.data
     * );
     * ```
     * @param filePath The file path
     * @param content The JSON object to write
     * @param options Options for the fs-extra command
     * @returns
     */
    public async writeJsonFile(
        filePath: string,
        content: unknown,
        options?: string | fse.WriteOptions
    ): Promise<void> {
        try {
            await fse.writeJson(filePath, content, options);
        } catch (e) {
            this.logger.error(
                `[${FilesystemUtil.CLASS_NAME}.writeJsonFile]`,
                `Failed to write JSON file to ${filePath}\n`,
                e
            );
        }
    }

    /**
     * Writes content to the file system at the given path.
     *
     * @example
     * ```typescript
     * FilesystemUtil.writeFile(
     *     (await import('path')).join(__dirname, '/myFile.json'),
     *      response.data
     * );
     * ```
     * @param filePath The file path
     * @param content The JSON object to write
     * @param options Options for the fs-extra command
     * @returns
     */
    public writeFile(
        filePath: string,
        content: string,
        options?: WriteFileOptions
    ): void {
        try {
            fse.writeFileSync(filePath, content, options);
        } catch (e) {
            this.logger.error(
                `[${FilesystemUtil.CLASS_NAME}.writeFile]`,
                `Failed to write file to ${filePath}\n`,
                e
            );
            return undefined;
        }
    }

    /**
     * Determine if the given value is a valid json object
     * @param value The value that might be a valid json object
     * @returns
     */
    public static isJsonFile(value: unknown): value is Record<string, unknown> {
        if (typeof value === 'undefined' || value === null) {
            return false;
        }

        if (typeof value === 'string') {
            return false;
        }

        if (typeof value === 'number') {
            return false;
        }

        if (typeof value === 'boolean') {
            return false;
        }

        if (typeof value !== 'object') {
            return false;
        }

        if (Array.isArray(value)) {
            return false;
        }

        return true;
    }

    private recursivelySearchParentDirectoriesForMatch(
        dirPath: string,
        rootFile = 'package.json'
    ): string {
        const targetRootFile = join(dirPath, rootFile);
        if (fse.existsSync(targetRootFile)) {
            return dirPath;
        } else {
            const parentDir = join(dirPath, '..');
            return this.recursivelySearchParentDirectoriesForMatch(parentDir);
        }
    }

    public getRootDir(): string {
        const filePath = dirname(realpathSync(__filename));
        let rootDir: string;
        if (process.env.WEBPACK_BUILD) {
            rootDir = join(filePath, './');
        } else {
            rootDir = join(
                this.recursivelySearchParentDirectoriesForMatch(filePath),
                './'
            );
        }
        return rootDir;
    }

    /**
     * Creates a sub-directory at the root folder of this project.
     * @param name The name of the subdirectory to create
     * @returns
     */
    public createSubdirectoryAtProjectRoot(
        name: string = FilesystemUtil.TMP_DIR
    ): string {
        try {
            const path = `${this.getRootDir()}${name}`;
            return this.createFolder(path);
        } catch (e) {
            this.logger.error(
                `[${FilesystemUtil.CLASS_NAME}.writeFile]`,
                `Failed to create directory ${name}\n`,
                e
            );
            throw e;
        }
    }

    public createFolder(fullpath: string): string {
        if (!fse.existsSync(fullpath)) {
            fse.mkdirSync(fullpath);
            return fullpath;
        }
        return fullpath;
    }

    public removeDirectory(path: string): boolean {
        try {
            fse.removeSync(path);
            return true;
        } catch (e) {
            this.logger.error(
                `[${FilesystemUtil.CLASS_NAME}.removeDirectory]`,
                `Failed to remove directory ${path}\n`,
                e
            );
            return false;
        }
    }

    public async createGlobFromPath(
        path: string,
        options?: GlobbyOptions
    ): Promise<Array<string>> {
        return await globby(path, options);
    }

    public createRelativePath(rootPath: string, filePath: string): string {
        return relative(rootPath, filePath);
    }

    /**
     * Clean the file path so that it is ready for subsequent processing.
     *
     * @param filePath The file path to process
     * @returns
     */
    public static cleanFilePath(filePath: string) {
        const sanitizedPath = filePath.replace(/\\/g, '/');

        return sanitizedPath;
    }

    /**
     * Get the file name from a file path string without the directory path.
     *
     * @param filePath The path to process
     * @returns
     */
    public static getFileNameFromPath(filePath: string): string {
        const sanitizedPath = FilesystemUtil.cleanFilePath(filePath);

        const pathParts = sanitizedPath.split('/');

        const [fileName] = pathParts.reverse();

        return fileName;
    }

    /**
     * Get only the directory portion of the file path as an array, excluding the file name
     * @param filePath The path to process
     * @returns
     */
    public static getDirectoryPartsFromPath(filePath: string): Array<string> {
        const sanitizedPath = FilesystemUtil.cleanFilePath(filePath);

        const pathParts = sanitizedPath.split('/');

        const [, ...directoryPaths] = pathParts.reverse();

        if (directoryPaths[directoryPaths.length - 1] === '.') {
            directoryPaths.pop();
        }

        return directoryPaths;
    }

    /**
     * Get all path parts for the given path string as an array, including the file name.
     *
     * @param filePath The path to process
     * @returns
     */
    public static getPathParts(filePath: string): Array<string> {
        let sanitizedPath = FilesystemUtil.cleanFilePath(filePath);

        sanitizedPath = sanitizedPath.startsWith('/')
            ? sanitizedPath.substring(1)
            : sanitizedPath;

        const pathElements = sanitizedPath.split('/');

        return pathElements;
    }
}
