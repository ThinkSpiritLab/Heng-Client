import { ChildProcess, spawn } from "child_process";
import { getLogger } from "log4js";
import path from "path";
import { Readable } from "stream";
import { loggedSpawn } from ".";
import { getConfig } from "../Config";
import { BasicSpawnOption } from "./BasicSpawn";

export interface JailBindMountOption {
    source: string;
    dest?: string;
    mode: "ro" | "rw";
}

export interface JailTmpfsMountOption {
    dest: string;
    size: number;
}

export interface JailSpawnOption {
    tmpfsMount?: JailTmpfsMountOption[];
    bindMount?: JailBindMountOption[];
    timelimit?: number; // ms default 600ms
    memorylimit?: number; // Byte default 512MB
    pidlimit?: number; // default 0->max
    filelimit?: number; // Byte default 1MB
}

export interface JailResult {
    memory: number; //bytes
    returnCode: number;
    signal: number;
    time: {
        real: number; //ms
        sys: number; //ms
        usr: number; //ms
    };
}

export interface JailedChildProcess extends ChildProcess {
    outFd: number;
    result: Promise<JailResult>;
}

const logger = getLogger("JailSpawn");

export function useJail(
    jailOption: JailSpawnOption
): (
    spawnFunction: (
        command: string,
        args: string[],
        options: BasicSpawnOption
    ) => ChildProcess
) => (
    command: string,
    args: string[],
    options: BasicSpawnOption
) => JailedChildProcess {
    const jailConfig = getConfig().nsjail;
    return function (
        spawnFunction: (
            command: string,
            args: string[],
            options: BasicSpawnOption
        ) => ChildProcess
    ) {
        return function (
            command: string,
            args: string[],
            options: BasicSpawnOption
        ): JailedChildProcess {
            if (!jailConfig.path) {
                throw "Jail not configured";
            }
            const jailArgs: string[] = [];

            if (jailConfig.configFile) {
                jailArgs.push("-C", path.resolve(jailConfig.configFile));
            }

            if (jailOption.tmpfsMount !== undefined) {
                for (const mountPoint of jailOption.tmpfsMount) {
                    jailArgs.push(
                        "-m",
                        `none:${mountPoint.dest}:tmpfs:size=${mountPoint.size}`
                    );
                }
            }

            if (jailOption.bindMount != undefined) {
                for (const mountPoint of jailOption.bindMount) {
                    let choice = "";
                    if (mountPoint.mode === "ro") {
                        choice = "-R";
                    } else {
                        choice = "-B";
                    }
                    let param = "";
                    if (mountPoint.dest !== undefined) {
                        param = `${mountPoint.source}:${mountPoint.dest}`;
                    } else {
                        param = mountPoint.source;
                    }

                    jailArgs.push(choice, path.resolve(param));
                }
            }

            if (jailOption.timelimit !== undefined) {
                jailOption.timelimit <= 0 &&
                    logger.warn(
                        "jailOption.timelimit <= 0. You'd better know what you're doing."
                    );
                jailArgs.push("-t", Math.ceil(jailOption.timelimit).toString());
                jailArgs.push("--rlimit_cpu", "soft");
            }

            if (jailOption.memorylimit != undefined) {
                jailOption.memorylimit <= 0 &&
                    logger.warn(
                        "jailOption.memorylimit <= 0. You'd better know what you're doing."
                    );
                jailArgs.push(
                    "--cgroup_mem_max",
                    Math.ceil(jailOption.memorylimit).toString()
                );
                jailArgs.push("--rlimit_as", "soft");
            }

            if (jailOption.pidlimit != undefined) {
                jailOption.pidlimit <= 0 &&
                    logger.warn(
                        "jailOption.pidlimit <= 0. You'd better know what you're doing."
                    );
                jailArgs.push(
                    "--cgroup_pids_max",
                    Math.ceil(jailOption.pidlimit).toString()
                );
            }
            jailArgs.push("--cgroup_cpu_ms_per_sec", "1000");

            if (jailOption.filelimit != undefined) {
                jailOption.filelimit <= 0 &&
                    logger.warn(
                        "jailOption.filelimit <= 0. You'd better know what you're doing."
                    );
                jailArgs.push(
                    "--rlimit_fsize",
                    Math.ceil(jailOption.filelimit / 1024 / 1024).toString()
                );
            }

            if (options.cwd) {
                jailArgs.push("--cwd", path.resolve(options.cwd));
                options.cwd = undefined;
            }
            if (options.uid !== undefined) {
                options.uid <= 0 &&
                    logger.warn(
                        "options.uid <= 0. You'd better know what you're doing."
                    );
                jailArgs.push("-u", `${options.uid}:${options.uid}:1`);
                options.uid = undefined;
            }
            if (options.gid !== undefined) {
                options.gid <= 0 &&
                    logger.warn(
                        "options.gid <= 0. You'd better know what you're doing."
                    );
                jailArgs.push("-g", `${options.gid}:${options.gid}:1`);
                options.gid = undefined;
            }

            if (options.env !== undefined) {
                //
                options.env = undefined;
            }

            if (typeof options.stdio === "string") {
                options.stdio = [options.stdio, options.stdio, options.stdio];
            }
            if (options.stdio === undefined) {
                options.stdio = ["pipe", "pipe", "pipe"];
            }
            const outFd = Math.max(3, options.stdio.length);
            if (options.stdio) {
                options.stdio.forEach((value, index) =>
                    jailArgs.push("--pass_fd", index.toString())
                );
            }
            options.stdio[outFd] = "pipe";
            jailArgs.push("-f", outFd.toString());

            jailArgs.push("--nice_level", "0");

            jailArgs.push("--", command, ...args);

            const subProcess = spawnFunction(
                jailConfig.path,
                jailArgs,
                options
            ) as JailedChildProcess;
            Object.assign(subProcess, {
                outFd,
                result: new Promise((resolve, reject) => {
                    subProcess.on("error", (err) => {
                        reject(err);
                    });
                    let resultStr = "";
                    const resultStream: Readable = subProcess.stdio[
                        outFd
                    ] as Readable;
                    resultStream.setEncoding("utf-8");
                    resultStream.on("error", (err) => {
                        reject(err);
                    });
                    resultStream.on("data", (chunk) => (resultStr += chunk));
                    resultStream.on("end", () => {
                        try {
                            logger.info(
                                `Command : ${command} Result : ${resultStr}`
                            );
                            resolve(JSON.parse(resultStr));
                        } catch (e) {
                            reject(e);
                        }
                    });
                }),
            });
            return subProcess;
        };
    };
}

export function jailSpawn(
    command: string,
    args: string[],
    option: BasicSpawnOption,
    jailOption: JailSpawnOption
): JailedChildProcess {
    return useJail(jailOption)(loggedSpawn(spawn))(command, args, option);
}
