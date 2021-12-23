import { ChildProcess, spawn } from "child_process";
import { getLogger } from "log4js";
import { range } from "lodash";
import { BasicSpawnOption, CompleteStdioOptions } from "./BasicSpawn";
import {
    JailBindMountOption,
    JailSpawnOption,
    JailSymlinkOption,
    JailTmpfsMountOption,
    useJail,
} from "./Jail";
import { MeteredChildProcess, MeterSpawnOption, useMeter } from "./Meter";

const logger = getLogger("JailMeterSpawn");

export interface HengSpawnOption {
    // mount
    tmpfsMount?: JailTmpfsMountOption[]; // nsjail
    bindMount?: JailBindMountOption[]; // nsjail
    symlink?: JailSymlinkOption[]; // nsjail

    // limit
    timeLimit?: number; // ms, meter, nsjail -> 2 * timeLimit(to avoid timer killed, get SE)
    memoryLimit?: number; // byte, meter, nsjail -> 4096
    pidLimit?: number; // meter
    fileLimit?: number; // byte, nsjail rlimit

    // args
    cwd?: string; // nsjail(get SE when cwd not mounted)
    env?: { [key: string]: string }; // nsjail
    stdio?: CompleteStdioOptions; // nsjail, meter save all fd except meterFd
    uid?: number; // nsjail(append root), meter
    gid?: number; // nsjail(append root), meter
}

export function loggedSpawn(
    spawnFunction: (command: string, args: string[]) => ChildProcess
): (command: string, args: string[]) => ChildProcess {
    return function (command: string, args: string[]) {
        logger.info(`${command} ${args.join(" ")}`);
        return spawnFunction(command, args);
    };
}

// intended typo, seted => set
export function optionSetedSpawn<V, T>(
    spawn: (command: string, args: string[], options: V) => T,
    options: V
): (command: string, args: string[]) => T {
    return function (command: string, args: string[]) {
        return spawn(command, args, options);
    };
}

export function hengSpawn(
    command: string,
    args: string[],
    options: HengSpawnOption
): MeteredChildProcess {
    const meterOption: MeterSpawnOption = { meterFd: 5 };
    const jailOption: JailSpawnOption = {};
    const basicOption: BasicSpawnOption = {};

    jailOption.tmpfsMount = options.tmpfsMount;
    jailOption.bindMount = options.bindMount;
    jailOption.symlink = options.symlink;

    if (options.timeLimit) {
        /** @notice */
        options.timeLimit = Math.ceil(options.timeLimit * 1.2);
        options.timeLimit += 250;

        meterOption.timeLimit = options.timeLimit;
        jailOption.timeLimit = Math.ceil((2 * options.timeLimit) / 1000);
        jailOption.rlimitCPU = "soft";
    }

    if (options.memoryLimit) {
        /** @notice */
        if (options.fileLimit) {
            options.memoryLimit += options.fileLimit;
        }

        meterOption.memoryLimit = options.memoryLimit;
        // jailOption.rlimitAS = 4096;
    }

    meterOption.pidLimit = options.pidLimit;

    if (options.fileLimit) {
        jailOption.rlimitFSIZE = Math.ceil(options.fileLimit / 1024 / 1024);
    }
    jailOption.rlimitSTACK = 64;

    jailOption.cwd = options.cwd;

    jailOption.env = options.env;

    if (options.stdio === undefined) {
        options.stdio = ["ignore", "ignore", "ignore"];
    }
    while (options.stdio.length < 3) options.stdio.push("ignore");
    meterOption.meterFd = options.stdio.length;
    options.stdio.push("pipe");
    jailOption.passFd = range(options.stdio.length);
    basicOption.stdio = options.stdio;

    meterOption.uid = options.uid;
    meterOption.gid = options.gid;
    jailOption.uidMap = [];
    jailOption.gidMap = [];
    jailOption.uidMap?.push({ inside: 0, outside: 0, count: 1 });
    jailOption.gidMap?.push({ inside: 0, outside: 0, count: 1 });
    if (options.uid) {
        jailOption.uidMap?.push({
            inside: options.uid,
            outside: options.uid,
            count: 1,
        });
    }
    if (options.gid) {
        jailOption.gidMap?.push({
            inside: options.gid,
            outside: options.gid,
            count: 1,
        });
    }

    return useMeter(meterOption)(
        useJail(jailOption)(loggedSpawn(optionSetedSpawn(spawn, basicOption)))
    )(command, args);
}
