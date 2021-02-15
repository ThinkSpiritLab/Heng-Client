import { spawn } from "child_process";
import { plainToClass } from "class-transformer";
import { getLogger } from "log4js";
import { config } from "../Config";
import { BasicSpawnOption, BasicChildProcess } from "./BasicSpawn";

class JailConfig {
    path: string;
    configFile?: string;
}

const jailConfig = plainToClass(JailConfig, config.nsjail);

export interface JailMountingPoint {
    path: string;
    mode: "ro" | "rw";
}

export interface JailSpawnOption {
    mount?: JailMountingPoint[];
    timelimit?: number; //s
    filelimit?: number; //MB
    memorylimit?: number; //MB
    pidlimit?: number;
}

export type JailedChildProcess = BasicChildProcess;

const logger = getLogger("JailSpawn");

export function useJail(jailOption: JailSpawnOption) {
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
        ): JailedChildProcess {
            const jailArgs: string[] = [];
            if (jailConfig.configFile) {
                jailArgs.push("-C", jailConfig.configFile);
            }
            if (jailOption.mount) {
                for (const mountPoint of jailOption.mount) {
                    switch (mountPoint.mode) {
                        case "ro":
                            jailArgs.push("-R", mountPoint.path);
                            break;
                        case "rw":
                            jailArgs.push("-B", mountPoint.path);
                            break;
                        default:
                            throw `Unkown mount type ${mountPoint.mode}`;
                            break;
                    }
                }
            }
            if (jailOption.timelimit) {
                jailArgs.push("-t", jailOption.timelimit.toString());
            }
            if (jailOption.memorylimit) {
                jailArgs.push("--rlimit_as", jailOption.memorylimit.toString());
            }
            // if (jailOption.pidlimit) {
            //     jailArgs.push(
            //         "--cgroup_pids_max",
            //         jailOption.pidlimit.toString()
            //     );
            // }
            if (options.cwd) {
                jailArgs.push("--cwd", options.cwd);
                // options.cwd = undefined;
                /*
                --cwd|-D VALUE
                    Directory in the namespace the process will run (default: '/')
                */
            }
            if (jailOption.filelimit) {
                jailArgs.push(
                    "--rlimit_fsize",
                    jailOption.filelimit.toString()
                );
            }
            if (options.stdio) {
                options.stdio.forEach((value, index, arry) =>
                    jailArgs.push("--pass_fd", index.toString())
                );
            }
            jailArgs.push("--", command, ...args);
            const subProcess = spawnFunction(
                jailConfig.path,
                jailArgs,
                options
            ) as JailedChildProcess;
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
    return useJail(jailOption)(spawn)(command, args, option);
}
