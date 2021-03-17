// nsjail -C ../../Heng-Client/jailConfig.cfg  --cwd $(pwd) -B $(pwd) -- $(which  hc) -m 2  --bin $(which java) --args -Xss256k -Xms1m -Xmx1m Main
import { getConfig } from "../../Config";
import { ConfiguredLanguage, Language } from ".";
import {
    BasicSpawnOption,
    JailSpawnOption,
    loggedSpawn,
    MeteredChildProcess,
} from "..";
import { useJail } from "../Jail";
import { spawn } from "child_process";
import { useMeter } from "../Meter";
import path from "path";

export function javaExtraArg(
    jailOption: JailSpawnOption,
    args: { [key: string]: string | number | boolean } | undefined
): string[] {
    const javaOption: string[] = [];
    if (jailOption.memorylimit !== undefined) {
        javaOption.push(
            args?.stackSize ? `-Xss${args.stackSize}k` : "-Xss256k",
            `-Xms${Math.ceil(jailOption.memorylimit / 4)}m`,
            `-Xmx${jailOption.memorylimit}m`
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
        ): MeteredChildProcess {
            if (jailOption.pidlimit !== undefined && jailOption.pidlimit < 32) {
                throw `Too narrow pidlimit ${jailOption.pidlimit} for Java`;
            }
            const javaOption: string[] = [];
            javaOption.push(...javaExtraArg(jailOption, javaargs));
            javaOption.push("-sourcepath", options.cwd ?? path.dirname(src));
            javaOption.push(src);
            return useMeter(jailOption)(
                useJail({
                    mount: jailOption.mount,
                    timelimit:
                        jailOption.timelimit !== undefined
                            ? jailOption.timelimit * 2
                            : undefined,
                    pidlimit:
                        jailOption.pidlimit !== undefined
                            ? jailOption.pidlimit + 2
                            : undefined,
                    filelimit: jailOption.filelimit,
                })(loggedSpawn(spawn))
            )(javac, javaOption, options);
        },
        function (
            command: string,
            args: string[],
            options: BasicSpawnOption,
            jailOption: JailSpawnOption
        ): MeteredChildProcess {
            if (jailOption.pidlimit !== undefined && jailOption.pidlimit < 32) {
                throw `Too narrow pidlimit ${jailOption.pidlimit} for Java`;
            }
            const javaOption: string[] = [];
            javaOption.push(...javaExtraArg(jailOption, javaargs));
            javaOption.push("-classpath", options.cwd ?? path.dirname(command));
            javaOption.push(path.basename(command, path.extname(command)));
            return useMeter(jailOption)(
                useJail({
                    mount: jailOption.mount,
                    timelimit:
                        jailOption.timelimit !== undefined
                            ? jailOption.timelimit * 2
                            : undefined,
                    pidlimit:
                        jailOption.pidlimit !== undefined
                            ? jailOption.pidlimit + 2
                            : undefined,
                    filelimit: jailOption.filelimit,
                })(loggedSpawn(spawn))
            )(java, javaOption, options);
        },
        `${javaargs?.className ?? "Main"}.java`,
        `${javaargs?.className ?? "Main"}.class`
    );
};
