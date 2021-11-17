import { ChildProcess } from "child_process";
import path from "path";
import { getConfig } from "../Config";

export interface JailBindMountOption {
    source: string;
    dest?: string;
    mode: "ro" | "rw";
}

export interface JailSymlinkOption {
    source: string;
    dest: string;
}

export interface JailTmpfsMountOption {
    dest: string;
    size: number;
}

export interface JailUGidMapOption {
    inside: number;
    outside: number;
    count: number;
}
export type RlimitString = "max" | "hard" | "def" | "soft" | "inf";

export interface JailSpawnOption {
    // mount
    tmpfsMount?: JailTmpfsMountOption[];
    bindMount?: JailBindMountOption[];
    symlink?: JailSymlinkOption[];
    uidMap?: JailUGidMapOption[];
    gidMap?: JailUGidMapOption[];

    timeLimit?: number; // s default inf

    // rlimit
    rlimitCPU?: number | RlimitString; // s default 600s
    rlimitAS?: number | RlimitString; // M default 4096MB
    rlimitFSIZE?: number | RlimitString; // M default 1MB

    cwd?: string;
    env?: { [key: string]: string };
    passFd?: number[];
}

export function useJail(
    jailOption: JailSpawnOption
): (
    spawnFunction: (command: string, args: string[]) => ChildProcess
) => (command: string, args: string[]) => ChildProcess {
    return function (
        spawnFunction: (command: string, args: string[]) => ChildProcess
    ) {
        return function (command: string, args: string[]): ChildProcess {
            const jailConfig = getConfig().nsjail;
            if (!jailConfig.path) {
                throw new Error("Jail not configured");
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

            if (jailOption.bindMount !== undefined) {
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

                    jailArgs.push(choice, param);
                }
            }

            if (jailOption.symlink !== undefined) {
                for (const sym of jailOption.symlink) {
                    jailArgs.push("-s", `${sym.source}:${sym.dest}`);
                }
            }

            if (jailOption.uidMap) {
                jailOption.uidMap.forEach((item) => {
                    jailArgs.push(
                        "-u",
                        `${item.inside}:${item.outside}:${item.count}`
                    );
                });
            }

            if (jailOption.gidMap) {
                jailOption.gidMap.forEach((item) => {
                    jailArgs.push(
                        "-g",
                        `${item.inside}:${item.outside}:${item.count}`
                    );
                });
            }

            if (jailOption.timeLimit !== undefined) {
                jailArgs.push("-t", Math.ceil(jailOption.timeLimit).toString());
            }

            if (jailOption.rlimitCPU !== undefined) {
                if (typeof jailOption.rlimitCPU === "number") {
                    jailArgs.push(
                        "--rlimit_cpu",
                        Math.ceil(jailOption.rlimitCPU).toString()
                    );
                } else {
                    jailArgs.push("--rlimit_cpu", jailOption.rlimitCPU);
                }
            }

            if (jailOption.rlimitAS !== undefined) {
                if (typeof jailOption.rlimitAS === "number") {
                    jailArgs.push(
                        "--rlimit_as",
                        Math.ceil(jailOption.rlimitAS).toString()
                    );
                } else {
                    jailArgs.push("--rlimit_as", jailOption.rlimitAS);
                }
            }

            if (jailOption.rlimitFSIZE !== undefined) {
                if (typeof jailOption.rlimitFSIZE === "number") {
                    jailArgs.push(
                        "--rlimit_fsize",
                        Math.ceil(jailOption.rlimitFSIZE).toString()
                    );
                } else {
                    jailArgs.push("--rlimit_fsize", jailOption.rlimitFSIZE);
                }
            }

            if (jailOption.cwd) {
                jailArgs.push("--cwd", path.resolve(jailOption.cwd));
            }

            if (jailOption.env !== undefined) {
                for (const name in jailOption.env) {
                    jailArgs.push("-E", `${name}=${jailOption.env[name]}`);
                }
            }

            if (jailOption.passFd !== undefined) {
                jailOption.passFd.forEach((value) =>
                    jailArgs.push("--pass_fd", value.toString())
                );
            }

            // jailArgs.push("--nice_level", "0");

            jailArgs.push("--", command, ...args);

            const subProcess = spawnFunction(jailConfig.path, jailArgs);
            return subProcess;
        };
    };
}
