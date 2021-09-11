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
async function wait(ms: number) {
    return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

async function createDir(dir: string) {
    await fs.promises.mkdir(dir + "/", { recursive: true, mode: 0o700 });
    await fs.promises.chown(
        dir,
        getConfig().judger.uid,
        getConfig().judger.gid
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
    if (getuid() || getgid()) {
        throw new Error("Please run with root");
    }
    await fs.promises.rmdir(
        path.join(os.tmpdir(), getConfig().judger.tmpdirBase),
        { recursive: true }
    );
    await createDir(path.join(os.tmpdir(), getConfig().judger.tmpdirBase));
    await createDir(
        path.join(os.tmpdir(), getConfig().judger.tmpdirBase, "bin")
    );
    await createDir(
        path.join(os.tmpdir(), getConfig().judger.tmpdirBase, "workspace")
    );
    await fs.promises.mkdir("/sys/fs/cgroup/cpu/NSJAIL", { recursive: true });
    await fs.promises.mkdir("/sys/fs/cgroup/memory/NSJAIL", {
        recursive: true,
    });
    await fs.promises.mkdir("/sys/fs/cgroup/pids/NSJAIL", { recursive: true });
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
        os.cpus().length,
        config.name,
        config.version
    );
    logger.info(`Token is ${token.token}`);
    await controller.connectWs(token.token);
    logger.info("Started");
}

main();
