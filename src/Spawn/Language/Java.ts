import { getConfig } from "../../Config";
import { ConfiguredLanguage, Language } from ".";
import { JailSpawnOption, loggedSpawn } from "..";
import { JailedChildProcess, useJail } from "../Jail";
import { spawn } from "child_process";
import path from "path";
import { BasicSpawnOption } from "../BasicSpawn";

export function javaExtraArg(
    jailOption: JailSpawnOption,
    args: { [key: string]: string | number | boolean } | undefined
): string[] {
    const javaOption: string[] = [];
    if (jailOption.memorylimit !== undefined) {
        javaOption.push(
            args?.stackSize ? `-Xss${args.stackSize}k` : "-Xss256k",
            `-Xms${Math.ceil(jailOption.memorylimit / 1024 / 1024 / 4)}m`,
            `-Xmx${Math.ceil(jailOption.memorylimit / 1024 / 1024)}m`
        );
    }
    return javaOption;
}

export const JAVA: Language = function (javaargs) {
    const java = getConfig().language.java;
    const javac = getConfig().language.javac;
    return new ConfiguredLanguage(
        function (
            src: string, //path
            output: string, //path
            options: BasicSpawnOption,
            jailOption: JailSpawnOption
        ): JailedChildProcess {
            if (jailOption.pidlimit !== undefined && jailOption.pidlimit < 32) {
                throw `Too narrow pidlimit ${jailOption.pidlimit} for Java`;
            }
            const javaOption: string[] = [];
            javaOption.push("-sourcepath", options.cwd ?? path.dirname(src));
            javaOption.push(src);
            return useJail({
                bindMount: jailOption.bindMount,
                timelimit:
                    jailOption.timelimit !== undefined
                        ? jailOption.timelimit * 2
                        : undefined,
                pidlimit:
                    jailOption.pidlimit !== undefined
                        ? jailOption.pidlimit + 2
                        : getConfig().judger.defaultPidLimit,
                filelimit: jailOption.filelimit,
                memorylimit: jailOption.memorylimit,
            })(loggedSpawn(spawn))(javac, javaOption, options);
        },
        function (
            command: string,
            args: string[],
            options: BasicSpawnOption,
            jailOption: JailSpawnOption
        ): JailedChildProcess {
            if (jailOption.pidlimit !== undefined && jailOption.pidlimit < 32) {
                throw `Too narrow pidlimit ${jailOption.pidlimit} for Java`;
            }
            const javaOption: string[] = [];
            javaOption.push(...javaExtraArg(jailOption, javaargs));
            javaOption.push("-classpath", options.cwd ?? path.dirname(command));
            javaOption.push(path.basename(command, path.extname(command)));
            return useJail({
                bindMount: jailOption.bindMount,
                timelimit:
                    jailOption.timelimit !== undefined
                        ? jailOption.timelimit * 2
                        : undefined,
                pidlimit:
                    jailOption.pidlimit !== undefined
                        ? jailOption.pidlimit + 2
                        : getConfig().judger.defaultPidLimit,
                filelimit: jailOption.filelimit,
                memorylimit: jailOption.memorylimit,
            })(loggedSpawn(spawn))(java, javaOption, options);
        },
        `${javaargs?.className ?? "Main"}.java`,
        `${javaargs?.className ?? "Main"}.class`
    );
};
