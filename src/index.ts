import { configure, getLogger } from "log4js";
import { plainToClass } from "class-transformer";
import { Controller, ControllerConfig } from "./controller";
import { cpus } from "os";
import { JudgeState, StatusReport } from "heng-protocol/internal-protocol/ws";
import { meterSpawn } from "./Spawn/Meter";
import { config } from "./Config";
async function wait(ms: number) {
    return new Promise((resolve, reject) =>
        setTimeout(() => resolve(null), ms)
    );
}

async function main() {
    configure({
        appenders: {
            cheese: { type: "file", filename: "cheese.log" },
            console: { type: "console" },
        },
        categories: {
            default: { appenders: ["cheese", "console"], level: "info" },
        },
    });

    const logger = getLogger("main");
    const controllerConfig = plainToClass(ControllerConfig, config.controller);
    const controller = new Controller(controllerConfig as ControllerConfig);
    const token = await controller.getToken(
        config.self["judgeCapability"],
        cpus().length,
        config.self["name"],
        config.self["version"]
    );
    controller.on("Judge", (task) => {
        setTimeout(() => {
            controller.do("UpdateJudges", [
                { id: task.id, state: JudgeState.Confirmed },
            ]);
        }, 100);
        setTimeout(() => {
            controller.do("UpdateJudges", [
                { id: task.id, state: JudgeState.Preparing },
            ]);
        }, 200);
        setTimeout(() => {
            controller.do("UpdateJudges", [
                { id: task.id, state: JudgeState.Pending },
            ]);
        }, 300);
        setTimeout(() => {
            controller.do("UpdateJudges", [
                { id: task.id, state: JudgeState.Judging },
            ]);
        }, 400);
        setTimeout(() => {
            controller.do("FinishJudges", [{ id: task.id }]);
        }, 1000);
        return new Promise((resolve, reject) => {
            resolve(undefined);
        });
    });
    logger.info(`Token is ${token.token}`);
    await controller.connectWs(token.token);
    setInterval(
        () =>
            controller.do("ReportStatus", {
                hardware: {
                    cpu: { percentage: 50 },
                    memory: { percentage: 50 },
                },
                task: {
                    pending: 0,
                    preparing: {
                        downloading: 0,
                        readingCache: 0,
                        compiling: 0,
                    },
                    judging: 0,
                    finished: 0,
                    total: 0,
                },
            } as StatusReport),
        1000
    );
    logger.info("Started");
    const meteredSubprocess = meterSpawn(
        "/usr/bin/ls",
        [],
        {},
        { timelimit: 1, memlimit: 10, pidlimit: 1 }
    );
    const res = await meteredSubprocess.result;
    logger.info(res);
}

main();
