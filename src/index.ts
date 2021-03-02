import { configure, getLogger } from "log4js";
import { plainToClass } from "class-transformer";
import { Controller } from "./controller";
import { cpus } from "os";
import { JudgeState } from "heng-protocol";
import { jailMeterSpawn } from "./Spawn";
import { getConfig } from "./Config";
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
    // const meteredSubprocess = jailMeterSpawn(
    //     "/usr/bin/ls",
    //     [],
    //     {},
    //     { timelimit: 1, memorylimit: 10, pidlimit: 1 }
    // );
    // const res = await meteredSubprocess.result;
    // logger.info(res);
    // const controller = new Controller(getConfig().controller);
    // const token = await controller.getToken(
    //     getConfig().self.judgeCapability,
    //     cpus().length,
    //     getConfig().self.name,
    //     getConfig().self.version
    // );
    // controller.on("CreateJudge", (task) => {
    //     setTimeout(() => {
    //         controller.do("UpdateJudges", {
    //             id: task.id,
    //             state: JudgeState.Confirmed,
    //         });
    //     }, 100);
    //     setTimeout(() => {
    //         controller.do("UpdateJudges", {
    //             id: task.id,
    //             state: JudgeState.Preparing,
    //         });
    //     }, 200);
    //     setTimeout(() => {
    //         controller.do("UpdateJudges", {
    //             id: task.id,
    //             state: JudgeState.Pending,
    //         });
    //     }, 300);
    //     setTimeout(() => {
    //         controller.do("UpdateJudges", {
    //             id: task.id,
    //             state: JudgeState.Judging,
    //         });
    //     }, 400);
    //     setTimeout(() => {
    //         controller.do("FinishJudges", {
    //             id: task.id,
    //             result: { cases: [] },
    //         });
    //     }, 1000);
    //     return new Promise((resolve, reject) => {
    //         resolve(undefined);
    //     });
    // });
    // logger.info(`Token is ${token.token}`);
    // await controller.connectWs(token.token);
    // setInterval(
    //     () =>
    //         controller.do("ReportStatus", {
    //             collectTime: new Date().toISOString(),
    //             nextReportTime: "1926-08-17",
    //             report: {
    //                 hardware: {
    //                     cpu: { percentage: 50 },
    //                     memory: { percentage: 50 },
    //                 },
    //                 judge: {
    //                     pending: 0,
    //                     preparing: {
    //                         downloading: 0,
    //                         readingCache: 0,
    //                         compiling: 0,
    //                     },
    //                     judging: 0,
    //                     finished: 0,
    //                     total: 0,
    //                 },
    //             },
    //         }),
    //     1000
    // );
    logger.info("Started");
}

main();
