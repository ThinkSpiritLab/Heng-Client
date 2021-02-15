import { spawn } from "child_process";
import { plainToClass } from "class-transformer";
import { getLogger } from "log4js";
import { Readable } from "stream";
import { config } from "../Config";
import { BasicSpawnOption, BasicChildProcess } from "./BasicSpawn";

class MeterConfig {
    path: string;
}

const meterConfig = plainToClass(MeterConfig, config.hc);

interface MeterSpawnOption {
    timelimit?: number; //second
    memlimit?: number; //MB
    pidlimit?: number;
}

interface MeterResult {
    memory: number; //bytes
    returnCode: number;
    signal: number;
    time: {
        real: number; //nanoseconds
        sys: number; //nanoseconds
        usr: number; //nanoseconds
    };
}

interface MeteredChildProcess extends BasicChildProcess {
    meterFd: number;
    result: Promise<MeterResult>;
}

const logger = getLogger("MeterSpawn");

export function useMeter(meterOption: MeterSpawnOption) {
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
            if (meterOption.memlimit) {
                hcargs.push("-m", meterOption.memlimit.toString());
            }
            if (meterOption.pidlimit) {
                hcargs.push("-p", meterOption.pidlimit.toString());
            }
            if (options.cwd) {
                hcargs.push("-c", options.cwd);
                options.cwd = undefined;
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
            logger.info(hcargs);
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
                            logger.log(resultStr);
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
) {
    return useMeter(meterOption)(spawn)(command, args, option);
}
