import os from 'os';
import fse from 'fs-extra';
import { LoggerUtil } from './logger.util';

export type ConfigUtilOptions = Readonly<{
    logger: LoggerUtil;
}>;

/**
 * The configuration object
 */
export type ModuleConf = Readonly<{
    /**
     * The path to a file containing a GitHub Personal Access Token for this configuration.
     * NOTE: This path must be relative to the user's home directory.
     */
    gitTokenFilePath?: string;
    /**
     * The API host against which all Git related operations will be performed for this configuration.
     */
    gitApiBase?: string;
}>;

/**
 * The structure of configurations in the .gitopsrc.json file should look like this.
 * The list is made up of configuration objects named by a key.
 */
export type ModuleConfList = Record<string, ModuleConf>;

export class ConfigUtil {
    private static readonly CLASS_NAME = 'ConfigUtil';

    public static readonly MODULE_CONF_FILE = `${os.homedir()}/.${
        process.env.MODULE_NAME ?? 'gitops'
    }rc.json`;

    private readonly logger: LoggerUtil;

    constructor(options: ConfigUtilOptions) {
        this.logger = options.logger;
    }

    /**
     * Reads all configurations that have been defined in .gitopsrc.json
     *
     * @param encoding
     * @returns
     */
    public readConfigurationList(
        encoding: BufferEncoding = 'utf8'
    ): ModuleConfList {
        try {
            const json = fse.readJSONSync(ConfigUtil.MODULE_CONF_FILE, {
                encoding
            });

            if (Object.keys(json).length === 0) {
                throw new Error(
                    `${ConfigUtil.MODULE_CONF_FILE} was found but no configuration values defined in it`
                );
            }

            return json as ModuleConfList;
        } catch (e) {
            this.logger.warn(
                `[${ConfigUtil.CLASS_NAME}.readConfigurationList]`,
                `No such configuration file ${ConfigUtil.MODULE_CONF_FILE}\n`,
                e instanceof Error ? e.message : undefined
            );

            return {};
        }
    }

    /**
     * Read user supplied configuration that is stored in ".gitopsrc.json".
     *
     * @param configName Read configuration for the specified key. If no key is specified, then the key called "default" is read.
     * @param encoding
     * @returns
     */
    public readConfiguration(
        configName = 'default',
        encoding: BufferEncoding = 'utf8'
    ): ModuleConf {
        try {
            const configList = this.readConfigurationList(encoding);

            const config = configList[configName as keyof ModuleConf];

            if (typeof config === 'undefined') {
                throw new Error(
                    `No such configuration for "${configName}" found in ${ConfigUtil.MODULE_CONF_FILE}`
                );
            }

            return config as ModuleConf;
        } catch (e) {
            this.logger.warn(
                `[${ConfigUtil.CLASS_NAME}.readConfiguration]`,
                `No such configuration file ${ConfigUtil.MODULE_CONF_FILE}\n`,
                e instanceof Error ? e.message : undefined
            );

            return {};
        }
    }
}
