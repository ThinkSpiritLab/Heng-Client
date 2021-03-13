import "reflect-metadata";
import { configure, getLogger } from "log4js";
import { Controller } from "./controller";
import { cpus } from "os";
import { JudgeState } from "heng-protocol";
import { getConfig } from "./Config";
import { getJudgerFactory } from "./Utilities/Judge";
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
    logger.info("Lunched");
    try {
        getConfig();
    } catch (e) {
        logger.fatal(e);
        await wait(2000);
        throw e;
    }
    const config = getConfig().self;
    const judgerFactory = await getJudgerFactory(getConfig().judger);
    const controller = new Controller(getConfig().controller);
    const token = await controller.getToken(
        config.judgeCapability,
        cpus().length,
        config.name,
        config.version
    );
    controller.on("Report", () => {
        return Promise.resolve({
            hardware: { cpu: { percentage: 50 }, memory: { percentage: 50 } },
            judge: {
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
        });
    });
    controller.on("CreateJudge", (task) => {
        setTimeout(() => {
            controller.do("UpdateJudges", {
                id: task.id,
                state: JudgeState.Confirmed,
            });
        }, 100);
        setTimeout(() => {
            controller.do("UpdateJudges", {
                id: task.id,
                state: JudgeState.Preparing,
            });
        }, 200);
        setTimeout(() => {
            controller.do("UpdateJudges", {
                id: task.id,
                state: JudgeState.Pending,
            });
        }, 300);
        setTimeout(() => {
            controller.do("UpdateJudges", {
                id: task.id,
                state: JudgeState.Judging,
            });
        }, 400);
        setTimeout(() => {
            controller.do("FinishJudges", {
                id: task.id,
                result: { cases: [] },
            });
        }, 1000);
        return new Promise((resolve, reject) => {
            resolve(null);
        });
    });
    logger.info(`Token is ${token.token}`);
    await controller.connectWs(token.token);
    logger.info("Started");
}

main();
