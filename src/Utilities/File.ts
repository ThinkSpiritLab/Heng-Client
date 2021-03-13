import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { pipeline, Readable } from "stream";
import * as unzip from "unzip-stream";
import Axios from "axios";

export type File = {
    hashsum?: string;
    content?: string;
    url?: string;
};

export function copy(source: string, dest: string) {
    let done = false;
    return new Promise<void>((resolve, reject) => {
        let finish = (err?: any) => {
            if (!done) {
                if (err !== undefined) {
                    reject(err);
                } else {
                    resolve();
                }
                done = true;
            }
        };
        const ifd = fs.createReadStream(source);
        const ofd = fs.createWriteStream(dest);
        const pipe = pipeline(ifd, ofd, (err) => finish());
        ifd.on("error", (err) => finish(err));
        ofd.on("error", (err) => finish(err));
        pipe.on("close", () => finish());
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
            .then(async (dir) => {
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
    async register(name: string, subpath: string) {
        subpath = path.join(this.dir, subpath);
        this.nameToFile.set(name, [null, subpath, true]);
    }
    async add(name: string, file: File, subpath?: string) {
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
                    return new Promise(async (resolve, reject) => {
                        const pipe = pipeline(
                            await readableFromFile(file),
                            fs.createWriteStream(subpath)
                        );
                        pipe.on("close", () => {
                            this.nameToFile.set(name, [null, subpath, true]);
                            resolve(subpath);
                        });
                        pipe.on("error", (err) => reject(err));
                    });
                } else {
                    throw "File not found nor writen";
                }
            }
        } else {
            return path.join(this.dir, "data", name);
        }
    }
    async clean() {
        return await fs.promises.rmdir(this.dir, { recursive: true });
    }
}
