import { spawn } from "child_process";
import { getLogger } from "log4js";
import path from "path";
import { Readable } from "stream";
import { getConfig } from "../Config";
import { BasicSpawnOption, BasicChildProcess } from "./BasicSpawn";

interface MeterSpawnOption {
    timelimit?: number; //second
    memorylimit?: number; //MB
    pidlimit?: number;
}

export interface MeterResult {
    memory: number; //bytes
    returnCode: number;
    signal: number;
    time: {
        real: number; //nanoseconds
        sys: number; //nanoseconds
        usr: number; //nanoseconds
    };
}

export interface MeteredChildProcess extends BasicChildProcess {
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
    ) => BasicChildProcess
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
        ) => BasicChildProcess
    ) {
        return function (
            command: string,
            args: string[],
            options: BasicSpawnOption
        ): MeteredChildProcess {
            const hcargs: string[] = [];
            if (meterOption.timelimit) {
                hcargs.push("-t", meterOption.timelimit.toString());
            }
            if (meterOption.memorylimit) {
                hcargs.push("-m", meterOption.memorylimit.toString());
            }
            if (meterOption.pidlimit) {
                hcargs.push("-p", meterOption.pidlimit.toString());
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
            const subProcess = (spawnFunction(
                meterConfig.path,
                hcargs,
                options
            ) as unknown) as MeteredChildProcess;
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
                            logger.info(`Result : ${resultStr}`);
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
