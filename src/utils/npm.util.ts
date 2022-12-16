import lodash from 'lodash';
import { LoggerUtil } from '@utils/logger.util';
import { ProcessorUtil } from '@utils/processsor.util';
import { SemverUtil } from '@utils/semver.util';

const { isObject, isArray, isEmpty, isString } = lodash;

export enum PackageTypes {
    d = 'devDependencies',
    o = 'optionalDependencies',
    s = 'dependencies'
}

export enum InstallModes {
    o = '--save-optional',
    d = '--save-dev',
    s = '--save'
}

export type PackageView = Readonly<{
    _id: string;
    _rev: string;
    name: string;
    description: string;
    'dist-tags': Record<string, string | undefined>;
    versions: Array<string>;
    author: string;
    time: Record<string, string | undefined>;
    keywords: Array<string>;
    license: string;
    _cached: boolean;
    _contentLength: number;
    version: string;
    engines: Record<string, string | undefined>;
    dependencies: unknown;
    devDependencies: unknown;
    bin: unknown;
    scripts: Record<string, string | undefined>;
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
    scripts?: Record<string, string | undefined>;
    dependencies: Record<string, string | undefined>;
    devDependencies?: Record<string, string | undefined>;
    optionalDependencies?: Record<string, string | undefined>;
    [key: string]: unknown;
}>;

export type NpmUtilOptions = Readonly<{
    logger: LoggerUtil;
    processorUtil: ProcessorUtil;
    semverUtil: SemverUtil;
}>;

export class NpmUtil {
    private static readonly CLASS_NAME = 'NpmUtil';

    public static readonly PACKAGE_JSON_FILE_NAME = 'package.json';
    public static readonly LOCKFILE_FILE_NAME = 'package-lock.json';

    private logger: LoggerUtil;
    private processorUtil: ProcessorUtil;
    private readonly semverUtil: SemverUtil;

    private _npmViewCache: Record<string, PackageView> = {};

    constructor(options: NpmUtilOptions) {
        this.logger = options.logger;
        this.semverUtil = options.semverUtil;
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

    /**
     * Function that will check if the given package version meets the supplied constraint and condition.
     * Will return true if either constraint or condition is empty
     */
    public async shouldUpdatePackageVersion(
        packageName: string,
        currentPackageVersion: string,
        packageUpdateConstraint?: string,
        packageUpdateCondition?: 'lte' | 'gte' | 'gt' | 'lt' | 'eq'
    ): Promise<boolean> {
        if (!packageUpdateConstraint || !packageUpdateCondition) {
            this.logger.info(
                `[${NpmUtil.CLASS_NAME}.shouldUpdatePackageVersion]`,
                `No package version constraint or condition was supplied, the function will assume that the update can proceed.`
            );
            return true;
        }

        try {
            const targetPackageVersion = await this.getRequestedPackageVersion(
                packageName,
                packageUpdateConstraint
            );

            if (!targetPackageVersion) {
                throw new Error(
                    `A target package version could not be resolved for the given costraint ${packageUpdateConstraint}`
                );
            }

            let term: string;
            switch (packageUpdateCondition) {
                case 'eq':
                    term = 'equal to';
                    break;
                case 'gt':
                    term = 'greater than';
                    break;
                case 'lt':
                    term = 'less than';
                    break;
                case 'gte':
                    term = 'greater than or equal to';
                    break;
                case 'lte':
                    term = 'less than or equal to';
                    break;
                default:
                    term = '?';
                    break;
            }

            this.logger.info(
                `[${NpmUtil.CLASS_NAME}.shouldUpdatePackageVersion]`,
                `Testing if current package version "${currentPackageVersion} is ${term} the resolved version constraint ${targetPackageVersion}"`
            );

            switch (packageUpdateCondition) {
                case 'eq':
                    return this.semverUtil.isEqualTo(
                        currentPackageVersion,
                        targetPackageVersion
                    );
                case 'gt':
                    return this.semverUtil.isGreaterThan(
                        currentPackageVersion,
                        targetPackageVersion
                    );
                case 'lt':
                    return this.semverUtil.isLessThan(
                        currentPackageVersion,
                        targetPackageVersion
                    );
                case 'gte':
                    return this.semverUtil.isGreaterThanOrEqualTo(
                        currentPackageVersion,
                        targetPackageVersion
                    );
                case 'lte':
                    return this.semverUtil.isLessThanOrEqualTo(
                        currentPackageVersion,
                        targetPackageVersion
                    );
                default:
                    this.logger.warn(
                        `[${NpmUtil.CLASS_NAME}.shouldUpdatePackageVersion]`,
                        `The provided condition ${packageUpdateCondition} was not recognized. This means that this function will reject the version update.`
                    );
                    return false;
            }
        } catch (e) {
            this.logger.error(
                `[${NpmUtil.CLASS_NAME}.shouldUpdatePackageVersion]`,
                `Failed to determine if the package ${packageName} should be updated\n`,
                e
            );
            throw e;
        }
    }

    public async getPackageView(packageName: string): Promise<PackageView> {
        if (Object.keys(this._npmViewCache).includes(packageName)) {
            this.logger.debug(
                `[${NpmUtil.CLASS_NAME}.getPackageView]`,
                `Cached package view was found for ${packageName}`
            );
            return this._npmViewCache[packageName];
        }

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
                this._npmViewCache[packageName] = packageView;
                return packageView;
            }

            throw new Error(
                'The command did not return a valid package view format'
            );
        } catch (e) {
            this.logger.error(
                `[${NpmUtil.CLASS_NAME}.getPackageView]`,
                `Failed to obtain package view for ${packageName}\n`,
                e
            );
            throw e;
        }
    }

    /**
     * Gets the requested version of a package if it exists
     *
     * @param packageName The package name to scan for
     * @param packageVersion The package version to match
     * @returns
     */
    public async getRequestedPackageVersion(
        packageName: string,
        packageVersion: string
    ): Promise<string | undefined> {
        try {
            const packageView = await this.getPackageView(packageName);

            const { versions, 'dist-tags': distTags } = packageView;

            let result: string | undefined;

            const sanitizedPackageVersion =
                this.semverUtil.isValid(packageVersion);

            if (sanitizedPackageVersion) {
                if (versions.includes(sanitizedPackageVersion)) {
                    result = lodash.find(
                        versions,
                        (version) => version === sanitizedPackageVersion
                    );
                } else {
                    this.logger.warn(
                        `[${NpmUtil.CLASS_NAME}.getRequestedPackageVersion]`,
                        `${packageVersion} was not found in ${packageName}.`
                    );
                }
            } else {
                // If not a semver, check if a distribution tag exist for the value given
                if (Object.keys(distTags).includes(packageVersion)) {
                    // Return the version that is specified for the given distribution tag if it exists
                    result = distTags[packageVersion];
                } else {
                    this.logger.warn(
                        `[${NpmUtil.CLASS_NAME}.getRequestedPackageVersion]`,
                        `${packageVersion} is not a a valid dist tag for ${packageName}.`
                    );
                }
            }

            return result;
        } catch (e) {
            this.logger.error(
                `[${NpmUtil.CLASS_NAME}.getRequestedPackageVersion]`,
                `Failed to determine if the package version ${packageVersion} exists in ${packageName}.\n`,
                e
            );
            throw e;
        }
    }

    public async doesPackageVersionExist(
        packageName: string,
        packageVersion: string
    ): Promise<string | undefined> {
        return this.getRequestedPackageVersion(packageName, packageVersion);
    }

    /**
     * Returns the package version if it exists in package.json or undefined if it doesn't.
     * Provide the checkAll option to search through all dependency types for this package name in the given package.json object.
     *
     * @param packageJson The package.json file to work on
     * @param packageName The package name to search for
     * @param packageType The type of package this is
     * @returns
     */
    public static doesDependencyExist(
        packageJson: Record<string, unknown>,
        packageName: string,
        packageType: 'd' | 's' | 'o',
        options: Readonly<{
            checkAll: boolean;
        }> = {
            checkAll: false
        }
    ): Readonly<{
        versionFound: string | undefined;
        packageType: 'd' | 's' | 'o';
    }> {
        if (!NpmUtil.isPackageJson(packageJson)) {
            throw new Error(
                `The given file content is not a valid ${NpmUtil.PACKAGE_JSON_FILE_NAME} file`
            );
        }

        const { dependencies, devDependencies, optionalDependencies } =
            packageJson;

        const dependencyKeys = Object.keys(dependencies ?? {});
        const devDependencyKeys = Object.keys(devDependencies ?? {});
        const optionalDependencyKeys = Object.keys(optionalDependencies ?? {});

        if (options.checkAll) {
            if (dependencyKeys.includes(packageName)) {
                return {
                    packageType: 's',
                    versionFound: dependencies?.[packageName]
                };
            } else if (devDependencyKeys.includes(packageName)) {
                return {
                    packageType: 'd',
                    versionFound: devDependencies?.[packageName]
                };
            } else if (optionalDependencyKeys.includes(packageName)) {
                return {
                    packageType: 'o',
                    versionFound: optionalDependencies?.[packageName]
                };
            } else {
                throw new Error(
                    `The package ${packageName} was not found in ${NpmUtil.PACKAGE_JSON_FILE_NAME}`
                );
            }
        } else {
            let objectToSearch: Record<string, string | undefined> | undefined;

            switch (packageType) {
                case 's':
                    objectToSearch = dependencies;
                    break;
                case 'd':
                    objectToSearch = devDependencies;
                    break;
                case 'o':
                    objectToSearch = optionalDependencies;
                    break;
                default:
                    objectToSearch = undefined;
                    break;
            }

            if (!objectToSearch) {
                throw new Error(
                    `The package ${packageName} was not found as a ${PackageTypes[packageType]} in ${NpmUtil.PACKAGE_JSON_FILE_NAME}`
                );
            }

            return {
                packageType,
                versionFound: objectToSearch[packageName]
            };
        }
    }

    /**
     * Adds the specified script to the scripts section of package.json
     *
     * @param packageJson The package.json file to work on
     * @param scriptKey The script key to add to the scripts section of package.json
     * @param scriptValue The key to match and remove from the scripts section of package.json
     * @returns
     */
    public addScript(
        packageJson: Record<string, unknown>,
        scriptKey: string,
        scriptValue: string,
        options: Readonly<{
            overrideExistingScriptKey: boolean;
        }> = {
            overrideExistingScriptKey: false
        }
    ): Record<string, unknown> | boolean {
        if (!NpmUtil.isPackageJson(packageJson)) {
            throw new Error(
                `The given file content is not a valid ${NpmUtil.PACKAGE_JSON_FILE_NAME} file`
            );
        }

        const { scripts, ...rest } = packageJson;

        if (scripts) {
            const keys = Object.keys(scripts);

            if (keys.includes(scriptKey)) {
                if (options.overrideExistingScriptKey) {
                    this.logger.warn(
                        `[${NpmUtil.CLASS_NAME}.addScript]`,
                        `Overriding existing key "${scriptKey}"`
                    );
                } else {
                    this.logger.warn(
                        `[${NpmUtil.CLASS_NAME}.addScript]`,
                        `Won't override existing key "${scriptKey}" in "scripts"`
                    );

                    return false;
                }
            }

            return {
                ...rest,
                scripts: {
                    ...scripts,
                    [scriptKey]: scriptValue
                }
            };
        } else {
            return {
                ...rest,
                scripts: {
                    [scriptKey]: scriptValue
                }
            };
        }
    }

    /**
     * Removes the specified script by key if found in the scripts section of package.json
     *
     * @param packageJson The package.json file to work on
     * @param scriptKey The key to match and remove from the scripts section of package.json
     * @returns
     */
    public removeScript(
        packageJson: Record<string, unknown>,
        scriptKey: string
    ): Record<string, unknown> | boolean {
        if (!NpmUtil.isPackageJson(packageJson)) {
            throw new Error(
                `The given file content is not a valid ${NpmUtil.PACKAGE_JSON_FILE_NAME} file`
            );
        }

        const { scripts, ...rest } = packageJson;

        if (scripts) {
            const keys = Object.keys(scripts);

            if (keys.includes(scriptKey)) {
                this.logger.info(
                    `[${NpmUtil.CLASS_NAME}.removeScript]`,
                    `Excluding matched key "${scriptKey}" in scripts`
                );

                const scriptsWithoutScriptKey = Object.fromEntries(
                    Object.entries(scripts).filter(([key, value]) => {
                        if (key !== scriptKey) {
                            return value;
                        }
                    })
                );

                return {
                    ...rest,
                    scripts: scriptsWithoutScriptKey
                };
            }
        }

        return false;
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
                prepare?.includes(options.removeOnlyWhen.keyword)
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
