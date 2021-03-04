import { Judge, JudgeType } from "heng-protocol";
import { CreateJudgeArgs } from "heng-protocol/internal-protocol/ws";
import path from "path";
import { getConfig } from "../Config";
import { getLanguage } from "../Spawn/Language";
import { copy } from "./File";
import * as fs from "fs";
import { jailMeterSpawn } from "../Spawn";
import { getLogger } from "log4js";

export class JudgeAgent {
    constructor(
        readonly factory: JudgeFactory,
        private judge: CreateJudgeArgs
    ) {}
}

export class JudgeFactory {
    constructor(readonly timeRatio: number, readonly timeIntercept: number) {}
}

export async function getJudgerFactory(): Promise<JudgeFactory> {
    const logger = getLogger("JudgeFactoryFactory");
    const judgerConfig = getConfig().judger;
    logger.info("self test loaded");
    const timeIntercept = 0;
    const result = (
        await Promise.all(
            judgerConfig.testcases.map(async (testcase, index) => {
                logger.info(`self test ${index} loaded`);
                const language = getLanguage(testcase.language);
                const configuredLanguage = language({});
                let curExcutablePath = path.resolve(testcase.cwd, testcase.src);
                logger.info(`copying src for testcase ${index}`);
                await fs.promises.copyFile(
                    curExcutablePath,
                    path.resolve(
                        testcase.cwd,
                        configuredLanguage.sourceFileName
                    )
                );
                logger.info(`copyed src for testcase ${index}`);
                curExcutablePath = path.resolve(
                    testcase.cwd,
                    configuredLanguage.sourceFileName
                );
                if (configuredLanguage.compileGenerator !== null) {
                    logger.info(`self test ${index} compiling`);
                    const compileProcess = configuredLanguage.compileGenerator(
                        path.resolve(
                            testcase.cwd,
                            configuredLanguage.sourceFileName
                        ),
                        path.resolve(
                            testcase.cwd,
                            configuredLanguage.compiledFileName
                        ),
                        { cwd: testcase.cwd },
                        {
                            timelimit: 10,
                            mount: [{ path: testcase.cwd, mode: "rw" }],
                        }
                    );
                    const compileResult = await compileProcess.result;
                    if (
                        compileResult.returnCode !== 0 ||
                        compileResult.signal !== -1
                    ) {
                        throw `Compile for testcase ${index} Failed`;
                    }
                    logger.info(`self test ${index} compiled`);
                    curExcutablePath = path.resolve(
                        testcase.cwd,
                        configuredLanguage.compiledFileName
                    );
                }
                const testProc = (
                    configuredLanguage.excuteGenerator ?? jailMeterSpawn
                )(
                    curExcutablePath,
                    testcase.args ?? [],
                    {
                        cwd: testcase.cwd,
                        stdio:
                            testcase.input !== undefined
                                ? [fs.createReadStream(testcase.input)]
                                : undefined,
                    },
                    {
                        timelimit:
                            judgerConfig.timeRatioTolerance *
                            2 *
                            testcase.timeExpected,
                        mount: [{ path: testcase.cwd, mode: "rw" }],
                    }
                );
                const testResult = await testProc.result;
                if (testResult.returnCode !== 0 || testResult.signal !== -1) {
                    throw `TestProc for testcase ${index} Failed`;
                }
                return [testcase.timeExpected*1e9, testResult.time.real];
            })
        )
    ).reduce((lop, rop) => [lop[0] + rop[0], lop[1] + rop[1]]);
    const timeRatio = result[1] / result[0];
    logger.info(`timeRatio is ${timeRatio}`);
    return new JudgeFactory(timeRatio, timeIntercept);
}
