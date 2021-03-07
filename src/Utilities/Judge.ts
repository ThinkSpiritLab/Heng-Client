import {
    Executable,
    Judge,
    JudgeResult,
    JudgeStatus,
    JudgeType,
} from "heng-protocol";
import { CreateJudgeArgs } from "heng-protocol/internal-protocol/ws";
import path from "path";
import * as fs from "fs";
import { getLogger } from "log4js";
import { JudgeFactoryConfig } from "../Config";
import { ConfiguredLanguage, getLanguage } from "../Spawn/Language";
import { copy, FileAgent } from "./File";
import { BasicSpawnOption, jailMeterSpawn, JailSpawnOption } from "../Spawn";
import { MeteredChildProcess, MeterResult } from "../Spawn/Meter";
import { StdioType } from "src/Spawn/BasicSpawn";

function languageFromExcutable(excutable: Executable): ConfiguredLanguage {
    return getLanguage(excutable.environment.language)(
        excutable.environment.options
    );
}

export class ExcutableAgent {
    compiled: boolean = false;
    configuredLanguage: ConfiguredLanguage;
    constructor(
        readonly excutable: Executable,
        private fileAgent: FileAgent,
        readonly name: string,
        readonly cwdPrefix: string
    ) {
        this.configuredLanguage = languageFromExcutable(excutable);
        fileAgent.add(
            name,
            excutable.source,
            path.join(cwdPrefix, this.configuredLanguage.sourceFileName)
        );
    }

    needCompile(): boolean {
        return (
            this.configuredLanguage.compileGenerator !== null && //compile is needed
            !this.compiled
        ); //not compiled
    }

    async compile(): Promise<MeterResult | void> {
        const srcpath = await this.fileAgent.getPath(this.name);
        if (
            this.needCompile() &&
            this.configuredLanguage.compileGenerator !== null
        ) {
            const compileLogFileStream = fs.createWriteStream(
                path.resolve(this.fileAgent.dir, this.cwdPrefix, "compile.log")
            );
            const compileProcess = this.configuredLanguage.compileGenerator(
                path.resolve(
                    this.fileAgent.dir,
                    this.cwdPrefix,
                    this.configuredLanguage.sourceFileName
                ),
                path.resolve(
                    this.fileAgent.dir,
                    this.cwdPrefix,
                    this.configuredLanguage.compiledFileName
                ),
                {
                    cwd: path.resolve(this.fileAgent.dir, this.cwdPrefix),
                    stdio: ["pipe", compileLogFileStream, compileLogFileStream],
                },
                {
                    timelimit: this.excutable.limit.compiler.cpuTime,
                    memorylimit: this.excutable.limit.compiler.memory,
                    filelimit: Math.max(
                        this.excutable.limit.compiler.output,
                        this.excutable.limit.compiler.message
                    ),
                    mount: [
                        {
                            path: path.resolve(
                                this.fileAgent.dir,
                                this.cwdPrefix
                            ),
                            mode: "rw",
                        },
                    ],
                }
            );
            this.compiled = true;
            return await compileProcess.result;
        } else {
            return;
        }
    }

    async exec(stdio: StdioType): Promise<MeteredChildProcess> {
        if (this.needCompile()) {
            throw "Excutable not compiled";
        } else {
            const excutablePath = path.resolve(
                this.fileAgent.dir,
                this.cwdPrefix,
                this.configuredLanguage.compiledFileName
            );
            const excuter =
                this.configuredLanguage.excuteGenerator ?? jailMeterSpawn;
            return excuter(
                excutablePath,
                [],
                {
                    cwd: path.resolve(this.fileAgent.dir, this.cwdPrefix),
                    stdio,
                },
                {
                    timelimit: this.excutable.limit.runtime.cpuTime,
                    memorylimit: this.excutable.limit.runtime.memory,
                    filelimit: this.excutable.limit.runtime.output,
                    mount: [{ path: excutablePath, mode: "ro" }],
                }
            );
        }
    }
}

export abstract class JudgeAgent {
    abstract getResult(): Promise<JudgeResult>;
    abstract getState(): JudgeStatus;
}

export class JudgeFactory {
    constructor(readonly timeRatio: number, readonly timeIntercept: number) {}

    // async getJudgerAgent(judge: CreateJudgeArgs): Promise<JudgeAgent> {}
}

export async function getJudgerFactory(
    judgerConfig: JudgeFactoryConfig
): Promise<JudgeFactory> {
    const logger = getLogger("JudgeFactoryFactory");
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
                return [testcase.timeExpected * 1e9, testResult.time.real];
            })
        )
    ).reduce((lop, rop) => [lop[0] + rop[0], lop[1] + rop[1]]);
    const timeRatio = result[1] / result[0];
    logger.info(`timeRatio is ${timeRatio}`);
    return new JudgeFactory(timeRatio, timeIntercept);
}
