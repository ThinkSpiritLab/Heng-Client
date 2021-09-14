import { ChildProcess } from "child_process";
import { getLogger } from "log4js";
import { BasicSpawnOption } from "./BasicSpawn";

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
        return spawnFunction(command, args, options);
    };
}
