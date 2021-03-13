import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { pipeline, Readable } from "stream";
import * as unzip from "unzip-stream";
import Axios from "axios";
import { PlatformPath } from "node:path";

export type File = {
    hashsum?: string;
    content?: string;
    url?: string;
};

export function readStream(s: Readable): Promise<string> {
    const data: string[] = [];
    s.on("data", (chunk) => {
        data.push(chunk.toString());
    });
    return new Promise<string>((resolve, reject) => {
        s.on("end", () => resolve(data.join()));
        s.on("error", (err) => reject(err));
    });
}

export function waitForOpen(s: fs.WriteStream): Promise<null> {
    return new Promise<null>((resolve) => {
        s.on("open", () => resolve(null));
    });
}

export function readableFromFile(file: File): Promise<Readable> {
    if (file.content !== undefined) {
        return Promise.resolve(Readable.from(file.content));
    } else if (file.url) {
        return Axios.get(file.url);
    } else {
        throw "Bad File";
    }
}

export class FileAgent {
    readonly dir: string;
    readonly ready: Promise<void>;
    private nameToFile = new Map<string, [File | null, string, boolean]>();
    constructor(readonly prefix: string, readonly primaryFile: File | null) {
        this.dir = path.join(os.tmpdir(), prefix);
        this.ready = fs.promises
            .mkdir(this.dir, {
                recursive: true,
                mode: 0o700,
            })
            .then(async () => {
                if (this.primaryFile) {
                    const pipe = pipeline(
                        await readableFromFile(this.primaryFile),
                        unzip.Extract({ path: path.join(this.dir, "data") })
                    );
                    return new Promise((resolve, reject) => {
                        pipe.on("close", () => resolve());
                        pipe.on("error", (err) => reject(err));
                    });
                }
                return;
            });
    }
    register(name: string, subpath: string): void {
        if (!path.isAbsolute(subpath)) {
            subpath = path.join(this.dir, subpath);
        }
        this.nameToFile.set(name, [null, subpath, true]);
    }
    add(name: string, file: File, subpath?: string): PlatformPath {
        if (subpath === undefined) {
            subpath = name;
        }
        subpath = path.join(this.dir, subpath);
        this.nameToFile.set(name, [file, subpath, false]);
        return path;
    }
    async getStream(name: string): Promise<Readable> {
        await this.ready;
        return fs.createReadStream(await this.getPath(name));
    }
    async getPath(name: string): Promise<string> {
        await this.ready;
        const record = this.nameToFile.get(name);
        if (record !== undefined) {
            const [file, subpath, writed] = record;
            if (writed) {
                return subpath;
            } else {
                if (file) {
                    await fs.promises.mkdir(path.dirname(subpath), {
                        recursive: true,
                        mode: 0o700,
                    });
                    const readable = await readableFromFile(file);
                    return new Promise((resolve, reject) => {
                        pipeline(
                            readable,
                            fs.createWriteStream(subpath),
                            (err) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve(subpath);
                                }
                            }
                        );
                        // pipe.on("close", () => {
                        //     this.nameToFile.set(name, [null, subpath, true]);
                        //     resolve(subpath);
                        // });
                        // pipe.on("error", (err) => reject(err));
                    });
                } else {
                    throw "File not found nor writen";
                }
            }
        } else {
            return path.join(this.dir, "data", name);
        }
    }
    async clean(): Promise<void> {
        return await fs.promises.rmdir(this.dir, { recursive: true });
    }
}
