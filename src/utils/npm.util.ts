import { LoggerUtil, LogLevel } from './logger.util';
import lodash from 'lodash';
import semver from 'semver';
import { ProcessorUtil } from './processsor.util';

const { isObject, isArray, isEmpty, isString } = lodash;

export type PackageView = Readonly<{
    _id: string;
    _rev: string;
    name: string;
    description: string;
    'dist-tags': Record<string, string>;
    versions: Array<string>;
    author: string;
    time: Record<string, string>;
    keywords: Array<string>;
    license: string;
    _cached: boolean;
    _contentLength: number;
    version: string;
    engines: Record<string, string>;
    dependencies: unknown;
    devDependencies: unknown;
    bin: unknown;
    scripts: Record<string, string>;
    [key: string]: unknown;
}>;

export type Lockfile = Readonly<{
    name: string;
    version: string;
    lockfileVersion: number;
    requires?: boolean;
    packages: {
        [key: string]: Readonly<
            Partial<{
                version: string;
                resolved: string;
                integrity: string;
                dev: boolean;
                license: string;
                bin: Record<string, string>;
                dependencies: Record<string, string>;
                peerDependencies: Record<string, string>;
                engines: Record<string, string>;
                funding: Readonly<
                    Partial<{
                        type: string;
                        url: string;
                    }>
                >;
            }>
        >;
    };
}>;

/**
 * Reference type for package.json files
 */
export type PackageJson = Readonly<{
    name: string;
    version?: string;
    description?: string;
    main?: string;
    exports?: string | Record<string, unknown>;
    engines?: Record<string, unknown>;
    author?: string;
    license?: string;
    files?: Array<string>;
    keywords?: Array<string>;
    bin?: Record<string, string>;
    scripts?: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies?: Record<string, string>;
    [key: string]: unknown;
}>;

export type NpmUtilOptions = Readonly<{
    logger: LoggerUtil;
    processorUtil: ProcessorUtil;
}>;

export class NpmUtil {
    private static readonly CLASS_NAME = 'NpmUtil';

    public static readonly PACKAGE_JSON_FILE_NAME = 'package.json';
    public static readonly LOCKFILE_FILE_NAME = 'package-lock.json';

    private logger: LoggerUtil;
    private processorUtil: ProcessorUtil;

    constructor(options: NpmUtilOptions) {
        this.logger = options.logger;
        this.processorUtil = options.processorUtil;
    }

    public parsePackageJson(value: unknown): PackageJson {
        if (!isString(value)) {
            throw new Error(
                `Failed to parse ${NpmUtil.PACKAGE_JSON_FILE_NAME}`
            );
        }

        const maybePackageJson = JSON.parse(value);

        if (!NpmUtil.isPackageJson(maybePackageJson)) {
            throw new Error(
                `Object is not a valid ${NpmUtil.PACKAGE_JSON_FILE_NAME} file`
            );
        }

        return maybePackageJson;
    }

    public async doesPackageVersionExist(
        packageName: string,
        packageVersion: string
    ): Promise<boolean> {
        try {
            const { response, code } = await this.processorUtil.spawnProcess(
                `npm`,
                [`view`, `${packageName}`, `--json`]
            );

            if (code !== 0) {
                throw new Error(
                    `npm view ${packageName} --json did not return a non zero status code`
                );
            }

            const packageView = JSON.parse(response);

            if (NpmUtil.isPackageView(packageView)) {
                const { versions, 'dist-tags': distTags } = packageView;

                if (semver.valid(packageVersion)) {
                    return versions.includes(packageVersion);
                } else {
                    return Object.keys(distTags).includes(packageVersion);
                }
            } else {
                throw new Error(
                    `Failed to parse results of npm view ${packageName}`
                );
            }
        } catch (e) {
            this.logger.error(
                `[${NpmUtil.CLASS_NAME}.doesPackageVersionExist]`,
                `Failed to determine if the package ${packageName} exists\n`,
                this.logger.logLevel === LogLevel.DEBUG
                    ? e
                    : (e as Error).message
            );
            throw e;
        }
    }

    public static doesDependencyExist(
        packageJson: Record<string, unknown>,
        packageName: string,
        packageType: 'd' | 's' | 'o'
    ): boolean {
        if (!NpmUtil.isPackageJson(packageJson)) {
            throw new Error(
                `The given file content is not a valid ${NpmUtil.PACKAGE_JSON_FILE_NAME} file`
            );
        }

        const dependencies = packageJson[
            packageType === 'd'
                ? 'devDependencies'
                : packageType === 'o'
                ? 'optionalDependencies'
                : 'dependencies'
        ] as Record<string, string>;

        return Object.keys(dependencies).includes(packageName);
    }

    /**
     * Removes the prepare script from the package.json content if available.
     *
     * Optionally, remove the prepare script only if it contains a certain keyword.
     *
     * By default, the prepare script is remove if it is found if no options are specified.
     *
     * @param packageJson The package.json file content to work on
     * @param options
     * @returns
     */
    public removePrepareScript(
        packageJson: Record<string, unknown>,
        options?: Readonly<{
            removeOnlyWhen?: Readonly<{
                keyword: string;
            }>;
        }>
    ): {
        packageJson: PackageJson;
        prepareScript?: string;
    } {
        if (!NpmUtil.isPackageJson(packageJson)) {
            throw new Error(
                `The given file content is not a valid ${NpmUtil.PACKAGE_JSON_FILE_NAME} file`
            );
        }

        const { scripts, ...rest } = packageJson;

        if (scripts) {
            const { prepare, ...otherScripts } = scripts;

            if (
                options?.removeOnlyWhen?.keyword &&
                prepare.includes(options.removeOnlyWhen.keyword)
            ) {
                this.logger.info(
                    `[${NpmUtil.CLASS_NAME}.removePrepareScript]`,
                    `Excluding prepare script that was found to contain "${options.removeOnlyWhen.keyword}"`
                );

                return {
                    packageJson: {
                        ...rest,
                        scripts: { ...otherScripts }
                    },
                    prepareScript: prepare
                };
            } else {
                return {
                    packageJson: {
                        ...rest,
                        scripts: { ...otherScripts }
                    },
                    prepareScript: prepare
                };
            }
        }

        return {
            packageJson
        };
    }

    public restorePrepareScript(
        packageJson: Record<string, unknown>,
        prepareScript: string
    ): PackageJson {
        if (!NpmUtil.isPackageJson(packageJson)) {
            throw new Error(
                `The given file content is not a valid ${NpmUtil.PACKAGE_JSON_FILE_NAME} file`
            );
        }

        const { scripts, ...rest } = packageJson;

        this.logger.info(
            `[${NpmUtil.CLASS_NAME}.restorePrepareScript]`,
            `Restoring prepare script that was removed previously`
        );

        return {
            ...rest,
            scripts: { ...scripts, prepare: prepareScript }
        };
    }

    public static isArray(value: unknown): value is unknown[] {
        if (isEmpty(value)) return false;
        return isArray(value);
    }

    public static isObject(value: unknown): value is Record<string, unknown> {
        if (isEmpty(value)) return false;
        if (isArray(value)) return false;
        return isObject(value);
    }

    public static isPackageJson(
        value: Record<string, unknown>
    ): value is PackageJson {
        if (!NpmUtil.isObject(value)) return false;
        const maybePackageJson = value as PackageJson;
        return 'name' in maybePackageJson;
    }

    public static isLockfileV1(value: Record<string, unknown>) {
        if (!NpmUtil.isObject(value)) return false;
        const maybeLockfile = value as Lockfile;

        if (
            'lockfileVersion' in maybeLockfile &&
            maybeLockfile.lockfileVersion === 1
        ) {
            return true;
        }

        return false;
    }

    public static isLockfileV2(
        value: Record<string, unknown>
    ): value is Lockfile {
        if (!NpmUtil.isObject(value)) return false;
        const maybeLockfile = value as Lockfile;

        if (
            'lockfileVersion' in maybeLockfile &&
            maybeLockfile.lockfileVersion === 2
        ) {
            return true;
        }

        return false;
    }

    public static isPackageView(
        value: Record<string, unknown>
    ): value is PackageView {
        if (!NpmUtil.isObject(value)) return false;
        const maybePackageView = value as PackageView;
        if (
            'name' in maybePackageView &&
            'dist-tags' in maybePackageView &&
            'versions' in maybePackageView
        ) {
            return true;
        }

        return false;
    }
}
