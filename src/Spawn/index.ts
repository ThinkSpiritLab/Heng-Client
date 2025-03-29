import { spawn } from "child_process";
import { getLogger } from "log4js";
import { constants } from "os";
import { BasicSpawnOption, CompleteStdioOptions } from "./BasicSpawn";
import { MeteredChildProcess } from "./Meter";

const logger = getLogger("JailMeterSpawn");

export interface HengSpawnOption {
    // limit
    timeLimit?: number; // ms, meter, nsjail -> 2 * timeLimit(to avoid timer killed, get SE)
    memoryLimit?: number; // byte, meter, nsjail -> 4096
    pidLimit?: number; // meter
    fileLimit?: number; // byte, nsjail rlimit

    // args
    cwd?: string; // nsjail(get SE when cwd not mounted)
    env?: Record<string, string>; // nsjail
    stdio?: CompleteStdioOptions; // nsjail, meter save all fd except meterFd
    uid?: number; // nsjail(append root), meter
    gid?: number; // nsjail(append root), meter
}

export function hengSpawn(
    command: string,
    args: string[],
    options: HengSpawnOption
) {
    const basicOption: BasicSpawnOption = {
        cwd: options.cwd,
        // shell: getConfig().language.shell,
        timeout: options.timeLimit,
    };

    if (options.stdio === undefined) {
        options.stdio = ["ignore", "ignore", "ignore"];
    }
    while (options.stdio.length < 3) options.stdio.push("ignore");
    options.stdio.push("pipe");
    basicOption.stdio = options.stdio;

    logger.info(`${command} ${args.join(" ")}`);
    const subProcess = spawn(command, args, basicOption);
    return Object.assign(subProcess, {
        result: new Promise((resolve, reject) => {
            subProcess.on("close", (code, signal) => {
                let signalNumber = -1;
                if (signal) {
                    signalNumber = constants.signals[signal];
                }
                resolve({
                    memory: 0,
                    returnCode: code ?? 9,
                    signal: signalNumber,
                    time: {
                        real: 0,
                        sys: 0,
                        usr: 0,
                    },
                });
            });
            subProcess.on("error", (err) => {
                reject(err);
            });
        }),
    }) as MeteredChildProcess;
}
