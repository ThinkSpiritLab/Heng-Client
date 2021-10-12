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
import { ExitArgs } from "heng-protocol/internal-protocol/ws";
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
            { recursive: true, mode: 0o700 }
        );
    }
    await fs.promises.mkdir(
        path.join(os.tmpdir(), getConfig().judger.tmpdirBase, "file"),
        { recursive: true, mode: 0o700 }
    );
    await fs.promises.mkdir(
        path.join(os.tmpdir(), getConfig().judger.tmpdirBase, "workspace"),
        { recursive: true, mode: 0o700 }
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

    let pendingExit = 0;

    controller.on("Exit", (args: ExitArgs) => {
        logger.warn(JSON.stringify(args));
        pendingExit = 1;
        setInterval(() => {
            const col = stat.collect();
            if (col.judge.total === col.judge.finished)
                controller.ws.close(1000, "控制端命令下线"), process.exit(1);
        }, 3000);
        setTimeout(() => {
            controller.ws.close(1000, "控制端命令下线，但评测任务超时"),
                process.exit(2);
        }, 300000);
        return Promise.resolve(null);
    });

    controller.on("CreateJudge", (task) => {
        if (pendingExit) {
            throw new Error("评测机正在等待下线");
        }
        const judgeAgent = judgerFactory.getJudgerAgent(task);
        (async () => {
            const judgeResult = await judgeAgent.getResultNoException();
            for (let i = 0; i < 3; i++) {
                try {
                    await controller.do("FinishJudges", {
                        id: task.id,
                        result: judgeResult,
                    });
                    break;
                } catch (error) {
                    logger.warn(
                        `返回 ${task.id} 的评测结果失败，${2 << i}秒后重试`
                    );
                    await wait((2 << i) * 1000);
                }
            }
        })().catch((error) => logger.fatal(error));
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
