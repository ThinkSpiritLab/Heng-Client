import {
    Executable,
    JudgeCaseResult,
    JudgeResult,
    JudgeResultKind,
    JudgeType,
} from "heng-protocol";
import { CreateJudgeArgs } from "heng-protocol/internal-protocol/ws";
import path from "path";
import * as fs from "fs";
import { getLogger } from "log4js";
import { JudgeFactoryConfig } from "../Config";
import { ConfiguredLanguage, getLanguage } from "../Spawn/Language";
import { FileAgent, readStream, waitForOpen } from "./File";
import { jailMeterSpawn } from "../Spawn";
import { MeteredChildProcess, MeterResult } from "../Spawn/Meter";
import { StdioType } from "src/Spawn/BasicSpawn";

function languageFromExcutable(excutable: Executable): ConfiguredLanguage {
    return getLanguage(excutable.environment.language)(
        excutable.environment.options
    );
}

export class ExecutableAgent {
    compiled = false;
    configuredLanguage: ConfiguredLanguage;
    constructor(
        readonly excutable: Executable,
        private fileAgent: FileAgent,
        readonly name: string,
        readonly cwdPrefix: string
    ) {
        this.configuredLanguage = languageFromExcutable(excutable);
        fileAgent.add(
            `${name}:src`,
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
        const srcpath = await this.fileAgent.getPath(`${this.name}:src`);
        if (
            this.needCompile() &&
            this.configuredLanguage.compileGenerator !== null
        ) {
            const compileLogPath = path.resolve(
                this.fileAgent.dir,
                this.cwdPrefix,
                "compile.log"
            );
            await fs.promises.mkdir(path.dirname(compileLogPath), {
                recursive: true,
            });
            const compileLogFileStream = fs.createWriteStream(compileLogPath);
            await waitForOpen(compileLogFileStream);
            this.fileAgent.register(`${this.name}:compile-log`, compileLogPath);
            const compileProcess = this.configuredLanguage.compileGenerator(
                srcpath,
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

    exec(stdio: StdioType): MeteredChildProcess {
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
    protected excutables: Executable[] = [];
    protected fileAgent: FileAgent;
    constructor(
        public judge: CreateJudgeArgs,
        public timeRatio: number,
        public timeIntercept: number
    ) {
        this.excutables.push(judge.judge.user);
        this.fileAgent = new FileAgent(
            path.join("Heng-Client", judge.id),
            judge.data ?? null
        );
    }

    getExtra = async (): Promise<{
        user?:
            | {
                  compileMessage?: string | undefined;
                  compileTime?: number | undefined; // ms
              }
            | undefined;
        spj?:
            | {
                  compileMessage?: string | undefined;
                  compileTime?: number | undefined; // ms
              }
            | undefined;
        interactor?:
            | {
                  compileMessage?: string | undefined;
                  compileTime?: number | undefined;
              }
            | undefined;
    }> => ({});
    async compileUsr(): Promise<
        [JudgeResult, undefined] | [undefined, ExecutableAgent]
    > {
        const userExecutableAgent = new ExecutableAgent(
            this.judge.judge.user,
            this.fileAgent,
            "usr",
            "usr"
        );
        const compileResult = await userExecutableAgent.compile();
        if (compileResult !== undefined) {
            this.getExtra = async () => ({
                user: {
                    compileTime: compileResult.time.usr,
                    compileMessage: fs
                        .readFileSync(
                            await this.fileAgent.getPath("usr:compile-log")
                        )
                        .toString(),
                },
            });
            if (
                compileResult.memory >
                this.judge.judge.user.limit.compiler.memory
            ) {
                return [
                    {
                        cases:
                            this.judge.test?.cases.map(() => ({
                                kind:
                                    JudgeResultKind.CompileMemoryLimitExceeded,
                                time: 0,
                                memory: 0,
                            })) ?? [],
                        extra: await this.getExtra(),
                    },
                    undefined,
                ];
            }
            if (
                compileResult.time.real >
                this.judge.judge.user.limit.compiler.cpuTime
            ) {
                return [
                    {
                        cases:
                            this.judge.test?.cases.map(() => ({
                                kind: JudgeResultKind.CompileTimeLimitExceeded,
                                time: 0,
                                memory: 0,
                            })) ?? [],
                        extra: await this.getExtra(),
                    },
                    undefined,
                ];
            }
            if (compileResult.signal === 25) {
                return [
                    {
                        cases:
                            this.judge.test?.cases.map(() => ({
                                kind: JudgeResultKind.CompileFileLimitExceeded,
                                time: 0,
                                memory: 0,
                            })) ?? [],
                        extra: await this.getExtra(),
                    },
                    undefined,
                ];
            }
            if (compileResult.signal !== -1 || compileResult.returnCode !== 0) {
                return [
                    {
                        cases:
                            this.judge.test?.cases.map(() => ({
                                kind: JudgeResultKind.CompileError,
                                time: 0,
                                memory: 0,
                            })) ?? [],
                        extra: await this.getExtra(),
                    },
                    undefined,
                ];
            }
        }
        return [undefined, userExecutableAgent];
    }

    abstract getResult(): Promise<JudgeResult>;

    async generateResult(
        userResult: MeterResult,
        userExec: Executable,
        sysResult: MeterResult,
        sysExec: Executable,
        sysJudge: string
    ): Promise<JudgeCaseResult> {
        return {
            kind: (() => {
                if (userResult.signal === 25) {
                    return JudgeResultKind.OutpuLimitExceeded;
                } else if (
                    userResult.time.usr > userExec.limit.runtime.cpuTime ||
                    userResult.time.real > userExec.limit.runtime.cpuTime * 1.5
                ) {
                    return JudgeResultKind.TimeLimitExceeded;
                } else if (userResult.memory > userExec.limit.runtime.memory) {
                    return JudgeResultKind.MemoryLimitExceeded;
                } else if (
                    userResult.signal !== -1 ||
                    userResult.returnCode !== 0
                ) {
                    return JudgeResultKind.RuntimeError;
                } else if (sysResult.signal === 25) {
                    return JudgeResultKind.SystemOutpuLimitExceeded;
                } else if (
                    sysResult.time.usr > sysExec.limit.runtime.cpuTime ||
                    sysResult.time.real > sysExec.limit.runtime.cpuTime * 1.5
                ) {
                    return JudgeResultKind.SystemTimeLimitExceeded;
                } else if (sysResult.memory > sysExec.limit.runtime.memory) {
                    return JudgeResultKind.SystemMemoryLimitExceeded;
                } else if (
                    sysResult.signal !== -1 ||
                    sysResult.returnCode !== 0
                ) {
                    return JudgeResultKind.SystemRuntimeError;
                } else if (sysJudge === "AC") {
                    return JudgeResultKind.Accepted;
                } else if (sysJudge === "WA") {
                    return JudgeResultKind.WrongAnswer;
                } else {
                    return JudgeResultKind.SystemError;
                }
            })(),
            time: userResult.time.usr * this.timeRatio + this.timeIntercept,
            memory: userResult.memory,
        };
    }
    async clean() {
        await this.fileAgent.clean();
    }
    // abstract getState(): JudgeStatus;
}

export class NormalJudgeAgent extends JudgeAgent {
    constructor(
        public judge: CreateJudgeArgs,
        public timeRatio: number,
        public timeIntercept: number,
        private cmp: string
    ) {
        super(judge, timeRatio, timeIntercept);
        if (judge.judge.type !== JudgeType.Normal) {
            throw `Wrong JudgeType ${judge.judge.type}(Should be ${JudgeType.Normal})`;
        }
    }

    async getResult(): Promise<JudgeResult> {
        const [compileResult, userExecutableAgent] = await this.compileUsr();
        if (compileResult !== undefined) {
            return compileResult;
        } else if (userExecutableAgent !== undefined) {
            const result = this.judge.test?.cases?.map?.(async (value) => {
                const [inputStream, stdPath] = await Promise.all([
                    this.fileAgent.getStream(value.input),
                    this.fileAgent.getPath(value.output),
                ]);
                const userProcess = userExecutableAgent.exec([
                    inputStream,
                    "pipe",
                    "pipe",
                ]);
                const compProcess = jailMeterSpawn(
                    this.cmp,
                    ["--std", stdPath],
                    { stdio: [userProcess.stdout] },
                    {
                        timelimit: this.judge.judge.user.limit.runtime.cpuTime,
                        memorylimit: this.judge.judge.user.limit.runtime.memory,
                        filelimit: this.judge.judge.user.limit.runtime.output,
                    }
                );
                const [userResult, cmpResult, cmpOut] = await Promise.all([
                    userProcess.result,
                    compProcess.result,
                    compProcess.stdout !== null
                        ? readStream(compProcess.stdout)
                        : "",
                ]);
                return this.generateResult(
                    userResult,
                    this.judge.judge.user,
                    cmpResult,
                    this.judge.judge.user,
                    cmpOut
                );
            });

            return {
                cases: await Promise.all(result ?? []),
                extra: await this.getExtra(),
            };
        }
        {
            return {
                cases: [
                    {
                        kind: JudgeResultKind.SystemError,
                        time: 0,
                        memory: 0,
                        extraMessage: "Unknow Compile Failed",
                    },
                ],
            };
        }
    }
}
//                cases: await Promise.all(this.judge.test?.cases?.map((case, index,arry)=>{return{kind:JudgeResultKind.Unjudged,time:0,memory:0}

// export class SpecialJudgeAgent extends JudgeAgent {
//     constructor(public judge: CreateJudgeArgs) {
//         super(judge);
//         if (judge.judge.type !== JudgeType.Special) {
//             throw `Wrong JudgeType ${judge.judge.type}(Should be ${JudgeType.Normal})`;
//         }
//         this.excutables.push(judge.judge.spj);
//     }
// }

// export class InteractiveJudgeAgent extends JudgeAgent {
//     constructor(public judge: CreateJudgeArgs) {
//         super(judge);
//         if (judge.judge.type !== JudgeType.Interactive) {
//             throw `Wrong JudgeType ${judge.judge.type}(Should be ${JudgeType.Normal})`;
//         }
//         this.excutables.push(judge.judge.interactor);
//     }
// }

export class JudgeFactory {
    constructor(
        readonly timeRatio: number,
        readonly timeIntercept: number,
        readonly cmp: string
    ) {}

    getJudgerAgent(judge: CreateJudgeArgs): JudgeAgent {
        switch (judge.judge.type) {
            case JudgeType.Normal: {
                return new NormalJudgeAgent(
                    judge,
                    this.timeRatio,
                    this.timeIntercept,
                    this.cmp
                );
            }
            default:
                throw "Unkown JudgeType";
        }
    }
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
                const fileAgent = new FileAgent(
                    `${process.pid}selfTest${index}`,
                    null
                );
                try {
                    await fileAgent.ready;
                    const language = getLanguage(testcase.language);
                    const configuredLanguage = language({});
                    let curExcutablePath = path.resolve(
                        fileAgent.dir,
                        configuredLanguage.sourceFileName
                    );
                    logger.info(`copying src for testcase ${index}`);
                    await fs.promises.copyFile(
                        path.resolve(testcase.src),
                        curExcutablePath
                    );
                    logger.info(`copyed src for testcase ${index}`);
                    if (configuredLanguage.compileGenerator !== null) {
                        logger.info(`self test ${index} compiling`);
                        const compileProcess = configuredLanguage.compileGenerator(
                            path.resolve(
                                fileAgent.dir,
                                configuredLanguage.sourceFileName
                            ),
                            path.resolve(
                                fileAgent.dir,
                                configuredLanguage.compiledFileName
                            ),
                            { cwd: fileAgent.dir },
                            {
                                timelimit: 10,
                                mount: [{ path: fileAgent.dir, mode: "rw" }],
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
                            fileAgent.dir,
                            configuredLanguage.compiledFileName
                        );
                    }
                    const testProc = (
                        configuredLanguage.excuteGenerator ?? jailMeterSpawn
                    )(
                        curExcutablePath,
                        testcase.args ?? [],
                        {
                            cwd: fileAgent.dir,
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
                            mount: [{ path: curExcutablePath, mode: "ro" }],
                        }
                    );
                    if (testProc.stdout) {
                        const testOutput = await readStream(testProc.stdout);
                        logger.info(`TestProc ${index} says ${testOutput}`);
                    }
                    const testResult = await testProc.result;
                    if (
                        testResult.returnCode !== 0 ||
                        testResult.signal !== -1
                    ) {
                        throw `TestProc for testcase ${index} Failed`;
                    }
                    logger.info(
                        `Test case ${index} completed in ${testResult.time.real}`
                    );
                    return [testcase.timeExpected * 1e9, testResult.time.real];
                } finally {
                    await fileAgent.clean();
                }
            })
        )
    ).reduce((lop, rop) => [lop[0] + rop[0], lop[1] + rop[1]]);
    const timeRatio = result[1] / result[0];
    logger.info(`timeRatio is ${timeRatio}`);
    return new JudgeFactory(timeRatio, timeIntercept, judgerConfig.cmp);
}
function async(): (
    value: import("heng-protocol").TestCase,
    index: number,
    array: import("heng-protocol").TestCase[]
) => void {
    throw new Error("Function not implemented.");
}
