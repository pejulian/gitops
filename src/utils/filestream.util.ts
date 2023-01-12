import fse from 'fs-extra';

export class FilestreamUtil {
    private readonly stream: fse.WriteStream;

    constructor(
        filePath: string,
        finishCallback: () => void,
        errorCallback: (err?: Error) => void,
        options?: Parameters<typeof fse.createWriteStream>[1]
    ) {
        this.stream = fse.createWriteStream(filePath, options);

        this.stream.on('finish', finishCallback);
        this.stream.on('error', errorCallback);
    }

    public write(content: string, encoding: BufferEncoding = 'utf8'): void {
        this.stream.write(content, encoding);
    }

    public close(): void {
        this.stream.close();
    }
}
