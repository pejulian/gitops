import fse from 'fs-extra';
import tar from 'tar';
import { LoggerUtil } from '@utils/logger.util';

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
        tarOps?: tar.ExtractOptions
    ): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            try {
                fse.createReadStream(filePath)
                    .pipe(
                        tar.extract({
                            ...tarOps
                        })
                    )
                    .on('error', (err) => {
                        throw err;
                    })
                    .on('finish', () => resolve());
            } catch (e) {
                this.logger.error(
                    `[${TarUtil.CLASS_NAME}.extract]`,
                    `An error occured while extracting the file\n`,
                    e
                );

                reject(e);
            }
        });
    }
}
