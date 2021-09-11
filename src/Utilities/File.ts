import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import stream, { Readable } from "stream";
import * as unzip from "unzip-stream";
import Axios from "axios";
import { PlatformPath } from "path";
import util from "util";
import { getConfig } from "../Config";
const pipeline = util.promisify(stream.pipeline);

export type File = {
    hashsum?: string;
    content?: string;
    url?: string;
};

export async function chownR(
    dirpath: string,
    uid: number,
    gid: number,
    depth: number
): Promise<void> {
    if (depth >= 4) {
        throw new Error("too deep folder");
    }
    const curdir = await fs.promises.opendir(dirpath);
    let subItem: fs.Dirent | null;
    while ((subItem = await curdir.read()) !== null) {
        if (subItem.isDirectory()) {
            await chownR(path.join(dirpath, subItem.name), uid, gid, depth + 1);
        } else if (subItem.isFile()) {
            await fs.promises.chown(path.join(dirpath, subItem.name), uid, gid);
        }
    }
    await fs.promises.chown(dirpath, uid, gid);
    await curdir.close();
}

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

export function waitForOpen(s: fs.WriteStream | fs.ReadStream): Promise<null> {
    return new Promise<null>((resolve) => {
        s.on("open", () => resolve(null));
    });
}

// todo pending fix
export function readableFromFile(file: File): Promise<Readable> {
    if (file.content !== undefined) {
        // if (file.hashsum) {
        //     if (
        //         file.hashsum !==
        //         crypto.createHash("sha256").update(file.content).digest("hex")
        //     ) {
        //         throw new Error("data broken");
        //     }
        // }
        return Promise.resolve(Readable.from(file.content));
    } else if (file.url) {
        return Axios.get(file.url);
    } else {
        throw "Bad File";
    }
}

export class FileAgent {
    readonly dir: string;
    private nameToFile = new Map<
        string,
        [File | null, string, boolean | Promise<boolean>]
    >();
    private Initialized = false;
    constructor(readonly prefix: string, readonly primaryFile: File | null) {
        this.dir = path.join(os.tmpdir(), prefix);
    }

    /**
     * must use init() after constructor
     * mkdir and download primaryFile
     */
    async init(cachedDir = false): Promise<void> {
        if (!cachedDir) {
            await fs.promises.mkdir(this.dir, {
                recursive: true,
                mode: 0o700,
            });
            if (this.primaryFile) {
                await pipeline(
                    await readableFromFile(this.primaryFile),
                    unzip.Extract({
                        path: path.join(this.dir, "data"),
                    })
                );
            }
            await chownR(
                this.dir,
                getConfig().judger.uid,
                getConfig().judger.gid,
                1
            );
        }
        this.Initialized = true;
    }

    checkInit(): void {
        if (!this.Initialized) {
            throw new Error("Don't forget to call init");
        }
    }

    register(name: string, subpath: string): void {
        this.checkInit();
        if (!path.isAbsolute(subpath)) {
            subpath = path.join(this.dir, subpath);
        }
        this.nameToFile.set(name, [null, subpath, true]);
    }
    add(name: string, file: File, subpath?: string): PlatformPath {
        this.checkInit();
        if (subpath === undefined) {
            subpath = name;
        }
        subpath = path.join(this.dir, subpath);
        this.nameToFile.set(name, [file, subpath, false]);
        return path;
    }
    async getStream(name: string): Promise<Readable> {
        this.checkInit();
        const s = fs.createReadStream(await this.getPath(name));
        await waitForOpen(s);
        return s;
    }
    async getFd(name: string): Promise<number> {
        this.checkInit();
        const s = fs.openSync(await this.getPath(name), "r");
        return s;
    }
    async getPath(name: string): Promise<string> {
        this.checkInit();
        const record = this.nameToFile.get(name);
        if (record !== undefined) {
            const [file, subpath, writed] = record;
            let ret = false;
            if (typeof writed !== "boolean") {
                try {
                    ret = await writed;
                } catch (error) {
                    ret = false;
                }
            } else {
                ret = writed;
            }
            if (ret) {
                return subpath;
            } else {
                const promise = Promise.resolve().then(async () => {
                    if (file) {
                        await fs.promises.mkdir(path.dirname(subpath), {
                            recursive: true,
                            mode: 0o700,
                        });
                        await fs.promises.chown(
                            path.dirname(subpath),
                            getConfig().judger.uid,
                            getConfig().judger.gid
                        ); // maybe not enough
                        await pipeline(
                            await readableFromFile(file),
                            fs.createWriteStream(subpath)
                        );
                        await fs.promises.chown(
                            subpath,
                            getConfig().judger.uid,
                            getConfig().judger.gid
                        );
                        return true;
                    } else {
                        throw new Error("File not found nor writen");
                    }
                });
                // this step maybe? too late / slow, then double promise
                this.nameToFile.set(name, [file, subpath, promise]);
                await promise;
                return subpath;
            }
        } else if (this.primaryFile !== null) {
            return path.join(this.dir, "data", name);
        } else {
            throw new Error("File not add or register");
        }
    }
    async clean(): Promise<void> {
        return await fs.promises.rmdir(this.dir, { recursive: true });
    }
}
