import { spawn, SpawnOptionsWithoutStdio } from 'child_process';
import { LoggerUtil } from './logger.util';

export type ProcessorUtilOptions = Readonly<{
    logger: LoggerUtil;
}>;

export class ProcessorUtil {
    private readonly logger: LoggerUtil;

    constructor(options: ProcessorUtilOptions) {
        this.logger = options.logger;
    }

    public spawnProcess(
        command: string,
        args: Array<string>,
        options?: SpawnOptionsWithoutStdio
    ): Promise<
        Readonly<{
            response: string;
            code: number | null;
        }>
    > {
        return new Promise((resolve) => {
            this.logger.info(
                `[ProcessorUtil.spawnProcess]`,
                `Running command: "${command} ${args.join(' ')}"`
            );

            const chunks: Array<string> = [];

            const process = spawn(command, args, {
                shell: true,
                stdio: ['pipe'],
                ...options
            });

            process.stdout?.setEncoding('utf8');
            process.stdout?.on('data', function (data) {
                chunks.push(data.toString());
            });

            process.stderr?.setEncoding('utf8');
            process.stderr?.on('data', function (data) {
                chunks.push(data.toString());
            });

            process.on('close', function (code) {
                resolve({
                    response: chunks.join(''),
                    code
                });
            });
        });
    }
}
