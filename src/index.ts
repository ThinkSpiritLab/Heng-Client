import "reflect-metadata";
import { configure, getLogger } from "log4js";
import { Controller } from "./controller";
import os from "os";
import fs from "fs";
import { getConfig } from "./Config";
import { getJudgerFactory } from "./Utilities/Judge";
import { Throttle } from "./Utilities/Throttle";
import { getgid, getuid } from "process";
import path from "path";
import { ExecTypeArray } from "./Spawn/Language/decl";
import { chownR } from "./Utilities/File";
import { stat } from "./Utilities/Statistics";
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
    if (getuid() || getgid()) {
        throw new Error("Please run with root");
    }
    await fs.promises.rmdir(
        path.join(os.tmpdir(), getConfig().judger.tmpdirBase),
        { recursive: true }
    );
    for (const execType of ExecTypeArray) {
        await fs.promises.mkdir(
            path.join(
                os.tmpdir(),
                getConfig().judger.tmpdirBase,
                "bin",
                execType
            ),
            { recursive: true }
        );
    }
    await fs.promises.mkdir(
        path.join(os.tmpdir(), getConfig().judger.tmpdirBase, "workspace"),
        { recursive: true }
    );
    await chownR(
        path.join(os.tmpdir(), getConfig().judger.tmpdirBase),
        getConfig().judger.uid,
        getConfig().judger.gid,
        1
    );
    await fs.promises.mkdir("/sys/fs/cgroup/cpu/NSJAIL", { recursive: true });
    await fs.promises.mkdir("/sys/fs/cgroup/memory/NSJAIL", {
        recursive: true,
    });
    await fs.promises.mkdir("/sys/fs/cgroup/pids/NSJAIL", { recursive: true });

    const config = getConfig().self;
    const judgerFactory = await getJudgerFactory(
        new Throttle(config.judgeCapability)
    );
    const controller = new Controller(getConfig().controller);
    judgerFactory.controller = controller;

    controller.on("CreateJudge", (task) => {
        const judgeAgent = judgerFactory.getJudgerAgent(task);
        stat.tick(task.id);
        judgeAgent.init().then(async () => {
            const judgeResult = await judgeAgent.getResultNoException();
            await judgeAgent.clean();
            stat.tick(task.id);
            await controller.do("FinishJudges", {
                id: task.id,
                result: judgeResult,
            });
        });
        return Promise.resolve(null);
    });

    const token = await controller.getToken(
        config.judgeCapability,
        os.cpus().length,
        config.name,
        config.version
    );
    logger.info(`Token is ${token.token}`);
    await controller.connectWs(token.token);
    logger.info("Started");
}

main();
