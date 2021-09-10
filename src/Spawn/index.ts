import { ChildProcess, spawn } from "child_process";
import { getLogger } from "log4js";
import { BasicSpawnOption } from "./BasicSpawn";
import { JailSpawnOption, useJail } from "./Jail";
import { MeteredChildProcess, useMeter } from "./Meter";

const logger = getLogger("JailMeterSpawn");

export function loggedSpawn(
    spawnFunction: (
        command: string,
        args: string[],
        options: BasicSpawnOption
    ) => ChildProcess
): (
    command: string,
    args: string[],
    options: BasicSpawnOption
) => ChildProcess {
    return function (
        command: string,
        args: string[],
        options: BasicSpawnOption
    ) {
        logger.info(`${command} ${args.join(" ")}`);
        // logger.info(option);
        return spawnFunction(command, args, options);
    };
}

function useJailAndMeter(jailOption: JailSpawnOption) {
    return function (
        spawnFunction: (
            command: string,
            args: string[],
            options: BasicSpawnOption
        ) => ChildProcess
    ) {
        return function (
            command: string,
            args: string[],
            options: BasicSpawnOption
        ): MeteredChildProcess {
            const meterOption = {
                timelimit: jailOption.timelimit,
                memorylimit: jailOption.memorylimit,
                pidlimit: jailOption.pidlimit,
            };
            if (jailOption.timelimit) {
                jailOption.timelimit *= 2;
            }
            if (jailOption.memorylimit) {
                jailOption.memorylimit *= 2;
            }
            if (jailOption.pidlimit) {
                jailOption.pidlimit += 3;
            }
            const subProcess = useMeter(meterOption)(
                useJail(jailOption)(loggedSpawn(spawnFunction))
            )(command, args, options);
            subProcess.on("error", (e) => {
                console.log(e);
                // TODO require fix
                throw e;
            });
            return subProcess;
        };
    };
}

function jailMeterSpawn(
    command: string,
    args: string[],
    options: BasicSpawnOption,
    jailOption: JailSpawnOption
): MeteredChildProcess {
    return useJailAndMeter(jailOption)(spawn)(command, args, options);
}

export {
    BasicSpawnOption,
    JailSpawnOption,
    MeteredChildProcess,
    useJailAndMeter,
    jailMeterSpawn,
};
