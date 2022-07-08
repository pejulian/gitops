import fse from 'fs-extra';

export class FileStreamUtils {
    private readonly stream: fse.WriteStream;

    constructor(
        filePath: string,
        callback: (err?: Error) => void,
        options?: Parameters<typeof fse.createWriteStream>[1]
    ) {
        this.stream = fse.createWriteStream(filePath, options);

        this.stream.on('finish', callback);
        this.stream.on('error', callback);
    }

    public write(content: string, encoding: BufferEncoding = 'utf8'): void {
        this.stream.write(content, encoding);
    }

    public close(): void {
        this.stream.close();
    }
}
