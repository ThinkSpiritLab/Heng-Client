import { ChildProcess } from "child_process";
import { getLogger } from "log4js";
import { Readable } from "stream";
import { getConfig } from "../Config";

export interface MeterSpawnOption {
    timeLimit?: number; // ms
    memoryLimit?: number; // byte
    pidLimit?: number;
    meterFd: number;
    uid?: number;
    gid?: number;
}

export interface MeterResult {
    memory: number; // bytes
    returnCode: number;
    signal: number;
    time: {
        real: number; // ms
        sys: number; // ms
        usr: number; // ms
    };
}

export const EmptyMeterResult: MeterResult = {
    memory: 0,
    returnCode: 0,
    signal: -1,
    time: {
        real: 0,
        usr: 0,
        sys: 0,
    },
};

export interface MeteredChildProcess extends ChildProcess {
    meterFd: number;
    result: Promise<MeterResult>;
}

const logger = getLogger("MeterSpawn");

export function useMeter(
    meterOption: MeterSpawnOption
): (
    spawnFunction: (command: string, args: string[]) => ChildProcess
) => (command: string, args: string[]) => MeteredChildProcess {
    return function (
        spawnFunction: (command: string, args: string[]) => ChildProcess
    ) {
        return function (command: string, args: string[]): MeteredChildProcess {
            const meterConfig = getConfig().hc;
            if (!meterConfig.path) {
                throw "Meter not configed";
            }

            const hcArgs: string[] = [];

            if (meterOption.timeLimit) {
                hcArgs.push("-t", Math.ceil(meterOption.timeLimit).toString());
                hcArgs.push("-cpu", "1");
            }

            if (meterOption.memoryLimit) {
                hcArgs.push(
                    "-m",
                    Math.ceil(meterOption.memoryLimit).toString()
                );
            }

            if (meterOption.pidLimit) {
                hcArgs.push("-p", Math.ceil(meterOption.pidLimit).toString());
            }

            if (meterOption.uid) {
                hcArgs.push("-u", meterOption.uid.toString());
            }
            if (meterOption.gid) {
                hcArgs.push("-g", meterOption.gid.toString());
            }

            hcArgs.push("-f", meterOption.meterFd.toString());

            hcArgs.push("--bin", command);

            hcArgs.push("--args", ...args);

            const subProcess = spawnFunction(
                meterConfig.path,
                hcArgs
            ) as MeteredChildProcess;

            subProcess.on("close", () => {
                // let FileHandle do it
                // options.stdio?.forEach((io) => {
                //     if (typeof io === "number") {
                //         fs.close(io, () => undefined);
                //     }
                // });
            });
            Object.assign(subProcess, {
                meterFd: meterOption.meterFd,
                result: new Promise((resolve, reject) => {
                    subProcess.on("error", (err) => {
                        reject(err);
                    });
                    let resultStr = "";
                    const resultStream: Readable = subProcess.stdio[
                        meterOption.meterFd
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
