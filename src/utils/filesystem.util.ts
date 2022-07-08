import { WriteFileOptions, realpathSync } from 'fs';
import { join, dirname } from 'path';
import fse from 'fs-extra';
import { LoggerUtil } from './logger.util';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __dirname = dirname(__filename);

export type FilesystemUtilsOptions = Readonly<{
    logger: LoggerUtil;
}>;

export class FilesystemUtils {
    private static readonly CLASS_NAME = 'FilesystemUtils';
    private readonly logger: LoggerUtil;

    constructor(options: FilesystemUtilsOptions) {
        this.logger = options.logger;
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
                `[${FilesystemUtils.CLASS_NAME}.readFile]`,
                `Failed to read file at ${filePath}`,
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
     * (await new FilesystemUtils()).writeJsonFile(
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
                `[${FilesystemUtils.CLASS_NAME}.writeJsonFile]`,
                `Failed to write JSON file to ${filePath}`,
                e
            );
        }
    }

    /**
     * Writes content to the file system at the given path.
     *
     * @example
     * ```typescript
     * FilesystemUtils.writeFile(
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
                `[${FilesystemUtils.CLASS_NAME}.writeFile]`,
                `Failed to write file to ${filePath}`,
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

    public createDirectory(name: string): string | undefined {
        try {
            const path = `${this.getRootDir()}${name}`;
            return this.createFolder(path);
        } catch (e) {
            this.logger.error(`Failed to create directory ${name}`, e);
            return undefined;
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
            return false;
        }
    }
}

// console.log(new FilesystemUtils().createDirectory('.tmp'));

// console.log(git statu
//     new FilesystemUtils().parseTopdanmarkInfrastructureConfigFile(
//         `export PARAMETERS="\
// Version=2.0.1 \
// AppName=c9-session-service \
// BasePath=session \
// LogLevel=info \
// DynatraceEnable=false \
// DynatraceLayerArn=DYNATRACE_LAYER_ARN \
// DynatraceEnvironmentId=DYNATRACE_ENVIRONMENT_ID \
// DynatraceClusterId=DYNATRACE_CLUSTER_ID \
// DynatraceAuthToken=DYNATRACE_AUTH_TOKEN \
// EnableProvisionedConcurrency=false \
// ProvisionedConcurrentExecutions=0 \
// wso2Environment=dscm289,dscm673
// "`,
//         'conf'
//     )
// );
