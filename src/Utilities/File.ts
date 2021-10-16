import os from "os";
import fs from "fs";
import stream, { Readable } from "stream";
import unzip from "unzip-stream";
import path, { PlatformPath } from "path";
import util from "util";
import { getConfig } from "../Config";
import * as crypto from "crypto";
import { Throttle } from "./Throttle";
import { getLogger } from "log4js";
import axios from "axios";
const pipeline = util.promisify(stream.pipeline);

const logger = getLogger("File");

export type File = {
    hashsum?: string;
    content?: string;
    url?: string;
};

/**
 * maxTry should be small
 * @param fn
 * @param maxTry
 * @returns
 */
export function retry<T>(fn: () => Promise<T>, maxTry: number): Promise<T> {
    return fn().catch((error) => {
        if (maxTry === 1) {
            throw error;
        } else {
            return retry(fn, maxTry - 1);
        }
    });
}

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

export async function readableFromUrl(url: string): Promise<Readable> {
    logger.info(`Downloading ${url}`);
    return (await axios.get(url, { responseType: "stream" })).data;
}

/**
 * may affect original array
 * @param arr
 * @param count
 */
function getRandomArrayElements(arr: string[], count: number) {
    count = Math.min(count, arr.length);
    for (let i = 0; i < count; i++) {
        const pos: number = Math.floor(Math.random() * (arr.length - i)) + i;
        [arr[i], arr[pos]] = [arr[pos], arr[i]];
    }
    return arr.slice(0, count);
}

const remoteFileMap = new Map<
    string,
    // fileName, writed, throttle, readCount, lastVisit
    [string, boolean, Throttle, number, number]
>();
const freeCacheThrottle = new Throttle(1);
let evictionPool: string[] = [];
let remoteFileBytesCount = 0;
// https://developer.aliyun.com/article/63034
// https://developer.aliyun.com/article/64435
function freeRemoteFileCache(requiredBtyes: number): Promise<void> {
    return freeCacheThrottle.withThrottle(async () => {
        let count = 0;
        while (
            count++ < 5 &&
            remoteFileMap.size &&
            remoteFileBytesCount + requiredBtyes >
                getConfig().judger.remoteFileCacheBytes
        ) {
            logger.info(
                `try free cache, current cache size: ${remoteFileBytesCount} btyes`
            );
            evictionPool = [
                ...evictionPool,
                ...getRandomArrayElements([...remoteFileMap.keys()], 10),
            ]
                .map((fileKey: string): [string, number] => {
                    const record = remoteFileMap.get(fileKey);
                    if (
                        record === undefined ||
                        record[1] !== true ||
                        record[3] !== 0 ||
                        Date.now() - record[4] <= 60000
                    ) {
                        return [fileKey, -1];
                    }
                    return [fileKey, record[4]];
                })
                .filter((keyAndTime: [string, number]) => {
                    return keyAndTime[1] !== -1;
                })
                .sort((a, b) => {
                    return a[1] - b[1];
                })
                .map((a) => a[0])
                .slice(0, 10);

            const pendingFreeFileKey = evictionPool.shift();
            if (pendingFreeFileKey === undefined) {
                // evictionPool.length === 0
                logger.warn(
                    "Remote file cache size exceeds, but can't free more space"
                );
                break;
            }
            const record = remoteFileMap.get(pendingFreeFileKey);
            if (!record) {
                logger.error("Unreachable code");
                continue;
            }
            const filePath = path.join(
                os.tmpdir(),
                getConfig().judger.tmpdirBase,
                "file",
                record[0]
            );
            logger.warn(`free cache ${pendingFreeFileKey}`);
            try {
                /** @throw ENOENT fatal error! */
                const stat = await fs.promises.stat(filePath);
                stat.isFile() && (await fs.promises.unlink(filePath));
                // isFile and deleted
                remoteFileBytesCount -= stat.size;
                remoteFileMap.delete(pendingFreeFileKey);
            } catch (error) {
                logger.fatal("Remote file disappear");
                logger.fatal(error);
                continue;
            }
        }
    });
}

const remoteFileDownloadThrottle = new Throttle(1);
export async function readableFromUrlFile(file: File): Promise<Readable> {
    if (file.content !== undefined) {
        throw new Error("Direct file provided");
    } else if (file.url) {
        const returnFun = async (fileKey: string) => {
            const record = remoteFileMap.get(fileKey);
            if (record === undefined) {
                throw new Error(
                    "Remote file record disappear(Unreachable code)"
                );
            }
            const fileName = record[0];
            record[4] = Date.now();
            remoteFileMap.set(fileKey, record);
            const filePath = path.join(
                os.tmpdir(),
                getConfig().judger.tmpdirBase,
                "file",
                fileName
            );
            const readable = fs.createReadStream(filePath);
            readable.on("close", () => {
                const record = remoteFileMap.get(fileKey);
                if (record === undefined) return;
                record[3]--;
                remoteFileMap.set(fileKey, record);
            });
            readable.on("open", () => {
                const record = remoteFileMap.get(fileKey);
                if (record === undefined) return;
                record[3]++, (record[4] = Date.now());
                remoteFileMap.set(fileKey, record);
            });
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
            record = ["", false, new Throttle(1), 0, Date.now()];
            remoteFileMap.set(fileKey, record);
        }

        let [fileName, writed] = record;
        const [, , throttle] = record;
        if (writed) {
            return await returnFun(fileKey);
        }
        return await throttle.withThrottle(async () => {
            record = remoteFileMap.get(fileKey);
            if (record === undefined) {
                throw new Error("Unreachable code");
            }
            [fileName, writed] = record;
            if (writed) {
                return await returnFun(fileKey);
            }

            fileName = crypto.randomBytes(32).toString("hex");
            const filePath = path.join(
                os.tmpdir(),
                getConfig().judger.tmpdirBase,
                "file",
                fileName
            );
            try {
                await remoteFileDownloadThrottle.withThrottle(
                    async () =>
                        await pipeline(
                            await readableFromUrl(file.url as string),
                            fs.createWriteStream(filePath, {
                                mode: 0o700,
                            })
                        )
                );
                if (file.hashsum) {
                    const hash = crypto.createHash("sha256");
                    await pipeline(fs.createReadStream(filePath), hash);
                    const hashString = hash.digest("hex");
                    if (hashString !== file.hashsum) {
                        throw new Error(
                            `Hash verification failed, expected: ${file.hashsum}, calculated: ${hashString}`
                        );
                    }
                }
                /** @throw ENOENT */
                const stat = await fs.promises.stat(filePath);
                if (!stat.isFile()) {
                    throw new Error("File disappear");
                }
                const fileSize = stat.size;
                await freeRemoteFileCache(fileSize);
                remoteFileMap.set(fileKey, [
                    fileName,
                    true,
                    throttle,
                    0,
                    Date.now(),
                ]);
                remoteFileBytesCount += fileSize;
            } catch (error) {
                // skip restore remoteFileMap
                /** @throw ENOENT */
                await fs.promises.unlink(filePath).catch(() => undefined);
                throw error;
            }
            return await returnFun(fileKey);
        });
    } else {
        throw new Error("Bad file");
    }
}

export async function readableFromFile(file: File): Promise<Readable> {
    if (file.content !== undefined) {
        return Readable.from(file.content);
    } else if (file.url) {
        return await retry(() => readableFromUrlFile(file), 2);
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

    private checkInit(): void {
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
