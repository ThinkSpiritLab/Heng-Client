import { spawn } from "child_process";
import { getLogger } from "log4js";
import { BasicChildProcess, BasicSpawnOption } from "./BasicSpawn";
import { JailSpawnOption, useJail } from "./Jail";
import { MeteredChildProcess, useMeter } from "./Meter";

const logger = getLogger("JailMeterSpawn");

function useJailAndMeter(jailOption: JailSpawnOption) {
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
        ): MeteredChildProcess {
            const meterOption = {
                timelimit: jailOption.timelimit,
                memorylimit: jailOption.memorylimit,
                pidlimit: jailOption.pidlimit,
            };
            jailOption.timelimit *= 2;
            jailOption.memorylimit *= 2;
            jailOption.pidlimit += 3;
            return useMeter(meterOption)(
                useJail(jailOption)((command, args, option) => {
                    logger.info(`${command} ${args.join(" ")}`);
                    logger.info(option);
                    return spawnFunction(command, args, option);
                })
            )(command, args, options);
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
