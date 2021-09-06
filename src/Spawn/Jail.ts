import { spawn } from "child_process";
// import { getLogger } from "log4js";
import path from "path";
import { getConfig } from "../Config";
import { BasicSpawnOption, BasicChildProcess } from "./BasicSpawn";

export interface JailMountingPoint {
    path: string;
    mode: "ro" | "rw";
}

export interface JailSpawnOption {
    mount?: JailMountingPoint[];
    timelimit?: number; //ms default600s
    filelimit?: number; //Byte default1MB
    memorylimit?: number; //Byte default512MB
    pidlimit: number; // default0->max
}

export type JailedChildProcess = BasicChildProcess;

// const logger = getLogger("JailSpawn");

export function useJail(
    jailOption: JailSpawnOption
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
) => JailedChildProcess {
    const jailConfig = getConfig().nsjail;
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
                jailArgs.push("-C", path.resolve(jailConfig.configFile));
            }
            if (!jailConfig.path) {
                throw "Jail not configured";
            }
            if (jailOption.mount) {
                for (const mountPoint of jailOption.mount) {
                    switch (mountPoint.mode) {
                        case "ro":
                            jailArgs.push("-R", path.resolve(mountPoint.path));
                            break;
                        case "rw":
                            jailArgs.push("-B", path.resolve(mountPoint.path));
                            break;
                        default:
                            throw `Unkown mount type ${mountPoint.mode}`;
                            break;
                    }
                }
            }
            if (jailOption.timelimit) {
                jailArgs.push(
                    "-t",
                    Math.ceil(jailOption.timelimit / 1000).toString()
                );
            }
            if (jailOption.memorylimit) {
                jailArgs.push(
                    "--rlimit_as",
                    Math.ceil(jailOption.memorylimit / 1024 / 1024).toString()
                );
            }
            // if (jailOption.pidlimit) {
            //     jailArgs.push(
            //         "--cgroup_pids_max",
            //         Math.ceil(jailOption.pidlimit).toString()
            //     );
            // }
            if (options.cwd) {
                jailArgs.push("--cwd", path.resolve(options.cwd));
                // options.cwd = undefined;
                /*
                --cwd|-D VALUE
                    Directory in the namespace the process will run (default: '/')
                */
            }
            if (jailOption.filelimit) {
                jailArgs.push(
                    "--rlimit_fsize",
                    Math.ceil(jailOption.filelimit / 1024 / 1024).toString()
                );
            }
            if (options.stdio) {
                options.stdio.forEach((value, index) =>
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
