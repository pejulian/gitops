import os from 'os';
import fse from 'fs-extra';
import { LoggerUtil } from '@utils/logger.util';

export type ConfigUtilOptions = Readonly<{
    logger: LoggerUtil;
}>;

export type ModuleConf = Readonly<{
    gitTokenFilePath?: string;
    gitApiBase?: string;
}>;

export class ConfigUtil {
    private static readonly CLASS_NAME = 'ConfigUtil';

    public static readonly MODULE_CONF_FILE = `${os.homedir()}/.${
        process.env.MODULE_NAME ?? 'gitops'
    }rc.json`;

    private readonly logger: LoggerUtil;

    constructor(options: ConfigUtilOptions) {
        this.logger = options.logger;
    }

    public readConfiguration(encoding: BufferEncoding = 'utf8'): ModuleConf {
        try {
            const json = fse.readJSONSync(ConfigUtil.MODULE_CONF_FILE, {
                encoding
            });

            if (Object.keys(json).length === 0) {
                throw new Error();
            }

            return json as ModuleConf;
        } catch (e) {
            this.logger.info(
                `[${ConfigUtil.CLASS_NAME}.readConfiguration]`,
                `No usable configuration file found at ${ConfigUtil.MODULE_CONF_FILE}\n`
            );

            return {};
        }
    }
}
