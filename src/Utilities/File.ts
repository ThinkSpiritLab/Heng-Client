import os from "os";
import fs from "fs";
import stream, { Readable } from "stream";
import unzip from "unzip-stream";
import path, { PlatformPath } from "path";
import util from "util";
import { getConfig } from "../Config";
import * as crypto from "crypto";
import { Throttle } from "./Throttle";
import http from "http";
import https from "https";
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

/**
 * @param s
 * @param size -1 == inf
 * @returns
 */
export function readStream(s: Readable, size: number): Promise<string> {
    let length = 0;
    const data: string[] = [];
    s.on("data", (chunk: Buffer) => {
        if (size === -1) {
            data.push(chunk.toString("utf-8"));
        } else {
            if (length < size) {
                data.push(chunk.slice(0, size - length).toString("utf-8"));
                length += chunk.byteLength;
            }
        }
    });
    return new Promise<string>((resolve, reject) => {
        s.on("end", () => resolve(data.join("")));
        s.on("error", (err) => reject(err));
    });
}

export function waitForOpen(s: fs.WriteStream | fs.ReadStream): Promise<null> {
    return new Promise<null>((resolve, reject) => {
        s.on("open", () => resolve(null));
        s.on("error", (err) => reject(err));
    });
}

export function readableFromUrl(url: string): Promise<Readable> {
    if (url.startsWith("http://")) {
        return new Promise((resolve) => {
            http.get(url, (res) => {
                resolve(res);
            });
        });
    } else if (url.startsWith("https://")) {
        return new Promise((resolve) => {
            https.get(url, (res) => {
                resolve(res);
            });
        });
    } else {
        throw new Error("Bad url");
    }
}

const remoteFileMap = new Map<string, [string, boolean, Throttle]>();

export async function readableFromFile(file: File): Promise<Readable> {
    if (file.content !== undefined) {
        return Readable.from(file.content);
    } else if (file.url) {
        const returnFun = async (fileName: string) => {
            const filePath = path.join(
                os.tmpdir(),
                getConfig().judger.tmpdirBase,
                "file",
                fileName
            );
            const readable = fs.createReadStream(filePath);
            await waitForOpen(readable);
            return readable;
        };

        let fileKey: string;
        if (file.hashsum) {
            fileKey = file.hashsum;
        } else {
            fileKey = file.url;
        }

        let record = remoteFileMap.get(fileKey);
        if (record === undefined) {
            record = ["", false, new Throttle(1)];
            remoteFileMap.set(fileKey, record);
        }

        let [fileName, writed] = record;
        const [, , throttle] = record;
        if (writed) {
            return await returnFun(fileName);
        }
        return throttle.withThrottle(async () => {
            record = remoteFileMap.get(fileKey);
            if (record === undefined) {
                throw new Error("Unreachable code");
            }
            [fileName, writed] = record;
            if (writed) {
                return await returnFun(fileName);
            }

            fileName = crypto.randomBytes(32).toString("hex");
            const filePath = path.join(
                os.tmpdir(),
                getConfig().judger.tmpdirBase,
                "file",
                fileName
            );
            try {
                await pipeline(
                    await readableFromUrl(file.url as string),
                    fs.createWriteStream(filePath, { mode: 0o700 })
                );
                if (file.hashsum) {
                    const hash = crypto.createHash("sha256");
                    await pipeline(
                        fs.createReadStream(filePath, { encoding: "binary" }),
                        hash
                    );
                    if (hash.digest("hex") !== file.hashsum) {
                        throw new Error("Hash verification failed");
                    }
                }
            } catch (error) {
                await fs.promises.unlink(filePath);
                throw error;
            }
            remoteFileMap.set(fileKey, [fileName, true, throttle]);
            return await returnFun(fileName);
        });
    } else {
        throw new Error("Bad file");
    }
}

export class FileAgent {
    readonly dir: string;
    private nameToFile = new Map<
        string,
        [File | null, string, boolean, Throttle]
    >();
    private Initialized = 0;
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
        this.Initialized++;
    }

    checkInit(): void {
        if (this.Initialized !== 1) {
            throw new Error("Don't forget to call init or init multiple times");
        }
    }

    register(name: string, subpath: string): void {
        this.checkInit();
        if (!path.isAbsolute(subpath)) {
            subpath = path.join(this.dir, subpath);
        }
        this.nameToFile.set(name, [null, subpath, true, new Throttle(1)]);
    }
    add(name: string, file: File, subpath?: string): PlatformPath {
        this.checkInit();
        if (subpath === undefined) {
            subpath = name;
        }
        subpath = path.join(this.dir, subpath);
        this.nameToFile.set(name, [file, subpath, false, new Throttle(1)]);
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
        let record = this.nameToFile.get(name);
        if (record !== undefined) {
            const [file, subpath, , throttle] = record;
            let [, , writed] = record;
            if (writed === true) {
                return subpath;
            }
            return throttle.withThrottle(async () => {
                record = this.nameToFile.get(name);
                if (record === undefined) {
                    throw new Error("Unreachable code");
                }
                [, , writed] = record;
                if (writed === true) {
                    return subpath;
                }
                if (file === null) {
                    throw new Error("File not found, unreachable code");
                }
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
                    fs.createWriteStream(subpath, {
                        mode: 0o700,
                    })
                );
                await fs.promises.chown(
                    subpath,
                    getConfig().judger.uid,
                    getConfig().judger.gid
                );
                this.nameToFile.set(name, [file, subpath, true, throttle]);
                return subpath;
            });
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
