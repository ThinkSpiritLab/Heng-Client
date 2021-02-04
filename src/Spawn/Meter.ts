import { spawn } from "child_process";
import { getLogger } from "log4js";
import { Readable } from "stream";
import { BasicSpawnOption, BasicChildProcess } from "./BasicSpawn";
interface MeterSpawnOptions extends BasicSpawnOption {
    timelimit?: number;
    memlimit?: number;
    pidlimit?: number;
}

interface MeterResult {
    memory: number;
    returnCode: number;
    signal: number;
    time: {
        real: number;
        sys: number;
        usr: number;
    };
}

interface MeteredChildProcess extends BasicChildProcess {
    meterFd: number;
    result: Promise<MeterResult>;
}

const logger = getLogger("MeterSpawn");

export function useMeter(
    spawnFunction: (
        command: string,
        args: string[],
        options: BasicSpawnOption
    ) => BasicChildProcess
) {
    return function (
        command: string,
        args: string[],
        options: MeterSpawnOptions
    ): MeteredChildProcess {
        const hcargs: string[] = [];
        if (options.timelimit) {
            hcargs.push("-t", options.timelimit.toString());
        }
        if (options.memlimit) {
            hcargs.push("-m", options.memlimit.toString());
        }
        if (options.pidlimit) {
            hcargs.push("-p", options.pidlimit.toString());
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
                options.stdio = ["pipe","pipe","pipe"];
            }
            meterFd = 3;
        }
        hcargs.push("-f", meterFd.toString());
        options.stdio[meterFd] = "pipe";
        hcargs.push("--args", ...args);
        const subProcess = (spawnFunction(
            "hc",
            hcargs,
            options
        ) as unknown) as MeteredChildProcess;
        Object.assign(subProcess, {
            meterFd,
            result: new Promise((resolve, reject) => {
                let resultStr = "";
                let resultStream: Readable = subProcess.stdio[
                    meterFd
                ] as Readable;
                resultStream.setEncoding("utf-8");
                resultStream.on("data", (chunk) => (resultStr += chunk));
                resultStream.on("end", () => {
                    try {
                        resolve(JSON.parse(resultStr));
                    } catch (e) {
                        reject(e);
                    }
                });
            }),
        });
        return subProcess;
    };
}

export const meterSpawn = useMeter((command, args, option) =>
    spawn(command, args, option)
);
