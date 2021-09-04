import "reflect-metadata";
import { configure, getLogger } from "log4js";
import { Controller } from "./controller";
import { cpus } from "os";
import { getConfig } from "./Config";
import { getJudgerFactory } from "./Utilities/Judge";
import { Throttle } from "./Utilities/Throttle";
async function wait(ms: number) {
    return new Promise((resolve) => setTimeout(() => resolve(null), ms));
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
    const judgerFactory = await getJudgerFactory(
        getConfig().judger,
        new Throttle(config.judgeCapability)
    );
    const controller = new Controller(getConfig().controller);
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
        const judgeAgent = judgerFactory.getJudgerAgent(task);
        const resultPromise = judgeAgent.getResultNoException();
        resultPromise.then((result) => {
            // logger.info(`Task:${JSON.stringify(task)}`);
            // logger.info(`Result:${JSON.stringify(result)}`);
            controller.do("FinishJudges", { id: task.id, result });
        });
        // .finally(() => judgeAgent.clean());
        return Promise.resolve(null);
    });
    const token = await controller.getToken(
        config.judgeCapability,
        cpus().length,
        config.name,
        config.version
    );
    logger.info(`Token is ${token.token}`);
    await controller.connectWs(token.token);
    logger.info("Started");
}

main();
