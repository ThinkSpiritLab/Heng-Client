import { ChildProcess, spawn } from "child_process";
import { getLogger } from "log4js";
import path from "path";
import { Readable } from "stream";
import { getConfig } from "../Config";
import { BasicSpawnOption } from "./BasicSpawn";

interface MeterSpawnOption {
    timelimit?: number; //ms
    memorylimit?: number; //byte
    pidlimit?: number;
}

export interface MeterResult {
    memory: number; //bytes
    returnCode: number;
    signal: number;
    time: {
        real: number; //ms
        sys: number; //ms
        usr: number; //ms
    };
}

export interface MeteredChildProcess extends ChildProcess {
    meterFd: number;
    result: Promise<MeterResult>;
}

const logger = getLogger("MeterSpawn");

export function useMeter(
    meterOption: MeterSpawnOption
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
) => MeteredChildProcess {
    const meterConfig = getConfig().hc;
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
        ): MeteredChildProcess {
            const hcargs: string[] = [];
            if (meterOption.timelimit) {
                hcargs.push("-t", Math.ceil(meterOption.timelimit).toString());
            }
            if (meterOption.memorylimit) {
                hcargs.push(
                    "-m",
                    Math.ceil(meterOption.memorylimit).toString()
                );
            }
            if (meterOption.pidlimit) {
                hcargs.push("-p", Math.ceil(meterOption.pidlimit).toString());
            }
            if (options.cwd) {
                hcargs.push("-c", path.resolve(options.cwd));
                // options.cwd = undefined;
            }
            if (options.uid) {
                hcargs.push("-u", options.uid.toString());
                options.uid = undefined;
            }
            if (options.gid) {
                hcargs.push("-g", options.gid.toString());
                options.gid = undefined;
            }
            hcargs.push("-cpu", "1");
            hcargs.push("--bin", command);
            let meterFd: number;
            if (options.stdio && options.stdio.length >= 3) {
                meterFd = options.stdio.length;
            } else {
                if (!options.stdio) {
                    options.stdio = ["pipe", "pipe", "pipe"];
                }
                meterFd = 3;
            }
            hcargs.push("-f", meterFd.toString());
            options.stdio[meterFd] = "pipe";
            hcargs.push("--args", ...args);
            // logger.info(hcargs);
            if (!meterConfig.path) {
                throw "Meter not configed";
            }
            const subProcess = spawnFunction(
                meterConfig.path,
                hcargs,
                options
            ) as unknown as MeteredChildProcess;
            Object.assign(subProcess, {
                meterFd,
                result: new Promise((resolve, reject) => {
                    let resultStr = "";
                    const resultStream: Readable = subProcess.stdio[
                        meterFd
                    ] as Readable;
                    resultStream.setEncoding("utf-8");
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
export function meterSpawn(
    command: string,
    args: string[],
    option: BasicSpawnOption,
    meterOption: MeterSpawnOption
): MeteredChildProcess {
    return useMeter(meterOption)(spawn)(command, args, option);
}
