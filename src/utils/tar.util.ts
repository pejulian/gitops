import fs from 'fs';
import tar from 'tar-fs';
import gunzip from 'gunzip-maybe';
import { LoggerUtil } from './logger.util';

export type TarUtilOptions = Readonly<{
    logger: LoggerUtil;
}>;

export class TarUtil {
    private static readonly CLASS_NAME = 'TarUtil';
    private readonly logger: LoggerUtil;

    constructor(options: TarUtilOptions) {
        this.logger = options.logger;
    }

    public async extract(
        filePath: string,
        targetDir: string,
        tarOpts?: tar.ExtractOptions
    ): Promise<void> {
        this.logger.debug(
            `[${TarUtil.CLASS_NAME}.extract]`,
            `Extracting the file at ${filePath} to the target directory ${targetDir}`
        );

        return new Promise<void>((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(gunzip())
                .pipe(tar.extract(targetDir, tarOpts))
                .on('error', (e) => {
                    this.logger.error(
                        `[${TarUtil.CLASS_NAME}.extract]`,
                        `An error occured while extracting the file\n`,
                        e
                    );
                    reject(e);
                })
                .on('finish', () => {
                    this.logger.debug(
                        `[${TarUtil.CLASS_NAME}.extract]`,
                        `Extracted to ${filePath}`
                    );

                    resolve();
                });
        });
    }
}
