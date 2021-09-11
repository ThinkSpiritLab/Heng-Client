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
import { getConfig, JudgeFactoryConfig } from "../Config";
import { FileAgent, readStream } from "./File";
import { Throttle } from "./Throttle";
import { Tests } from "../SelfTest";
import { Readable } from "stream";
import { JailResult } from "../Spawn/Jail";
import { CompileLogName, ExecutableAgent } from "./ExecutableAgent";
import { ExecType } from "../Spawn/LanguageV2/decl";

const UsrCompileResultTransformer = {
    mle: JudgeResultKind.CompileMemoryLimitExceeded,
    tle: JudgeResultKind.CompileTimeLimitExceeded,
    ole: JudgeResultKind.CompileFileLimitExceeded,
    ce: JudgeResultKind.CompileError,
};
const OtherCompileResultTransformer = {
    mle: JudgeResultKind.SystemCompileError,
    tle: JudgeResultKind.SystemCompileError,
    ole: JudgeResultKind.SystemCompileError,
    ce: JudgeResultKind.SystemCompileError,
};

export abstract class JudgeAgent {
    protected ExecutableAgents: ExecutableAgent[] = [];
    protected fileAgent: FileAgent;
    protected logger = getLogger("JudgeAgent");
    private Initialized = false;
    protected extra: {
        user?: {
            compileMessage?: string;
            compileTime?: number;
        };
        spj?: {
            compileMessage?: string;
            compileTime?: number;
        };
        interactor?: {
            compileMessage?: string;
            compileTime?: number;
        };
    } = {};

    constructor(
        public judge: CreateJudgeArgs,
        public timeRatio: number,
        public timeIntercept: number,
        readonly throttle: Throttle
    ) {
        this.fileAgent = new FileAgent(
            path.join(getConfig().judger.tmpdirBase, "workspace", judge.id),
            judge.data ?? null
        );
    }

    async init(): Promise<void> {
        await this.fileAgent.init();
        if (this.judge.dynamicFiles !== undefined) {
            this.judge.dynamicFiles.forEach((file) => {
                if (file.type === "remote") {
                    this.fileAgent.add(file.name, file.file);
                }
            });
        }
        this.Initialized = true;
    }

    checkInit(): void {
        if (!this.Initialized) {
            throw new Error("Don't forget to call init");
        }
    }

    async compileAndFillExtra(
        execType: ExecType,
        executable: Executable,
        transformer: {
            mle: JudgeResultKind;
            tle: JudgeResultKind;
            ole: JudgeResultKind;
            ce: JudgeResultKind;
        }
    ): Promise<[ExecutableAgent, JudgeResult | undefined]> {
        this.checkInit();
        const executableAgent = new ExecutableAgent(execType, executable);
        this.ExecutableAgents.push(executableAgent);
        await executableAgent.init();
        const compileResult = await this.throttle.withThrottle(() =>
            executableAgent.compile()
        );
        if (compileResult !== undefined) {
            const exteaInfo = {
                compileTime: Math.ceil(compileResult.time.usr * this.timeRatio),
                compileMessage: (
                    await fs.promises.readFile(
                        await executableAgent.fileAgent.getPath(CompileLogName)
                    )
                ).toString("utf-8"),
            };
            if (execType === ExecType.Usr) {
                this.extra.user = exteaInfo;
            } else if (execType === ExecType.Spj) {
                this.extra.spj = exteaInfo;
            } else if (execType === ExecType.Interactor) {
                this.extra.interactor = exteaInfo;
            }
            let compileJudgeType: JudgeResultKind | undefined = undefined;
            if (
                compileResult.memory >
                this.judge.judge.user.limit.compiler.memory
            ) {
                compileJudgeType = transformer.mle;
            } else if (
                compileResult.time.usr >
                this.judge.judge.user.limit.compiler.cpuTime
            ) {
                compileJudgeType = transformer.tle;
            } else if (compileResult.signal === 25) {
                compileJudgeType = transformer.ole;
            } else if (
                compileResult.signal !== -1 ||
                compileResult.returnCode !== 0
            ) {
                compileJudgeType = transformer.ce;
            }
            let judgeResult: JudgeResult | undefined = undefined;
            if (compileJudgeType !== undefined) {
                judgeResult = {
                    cases: [
                        {
                            kind: compileJudgeType,
                            time: 0,
                            memory: 0,
                        },
                    ],
                    extra: this.extra,
                };
            }
            return [executableAgent, judgeResult];
        } else {
            return [executableAgent, undefined];
        }
    }

    abstract getResult(): Promise<JudgeResult>;

    async getResultNoException(): Promise<JudgeResult> {
        this.checkInit();
        try {
            return await this.getResult();
        } catch (e) {
            this.logger.fatal(e);
            return {
                cases: [
                    {
                        kind: JudgeResultKind.SystemError,
                        time: 0,
                        memory: 0,
                    },
                ],
            };
        }
    }

    generateCaseResult(
        userResult: JailResult,
        userExec: Executable,
        sysResult: JailResult,
        sysExec: Executable,
        sysJudge: string
    ): JudgeCaseResult {
        this.checkInit();
        sysJudge = sysJudge.trim();
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
                    // Adapt to ojcmp v0.4.0
                    ![0, 1, 2].includes(sysResult.returnCode)
                ) {
                    return JudgeResultKind.SystemRuntimeError;
                } else if (sysJudge === "AC" || sysJudge === "PE") {
                    // May add ResultType PE
                    return JudgeResultKind.Accepted;
                } else if (sysJudge === "WA") {
                    return JudgeResultKind.WrongAnswer;
                } else {
                    getLogger("generateResult").fatal(
                        `Judger says:${sysJudge}`
                    );
                    return JudgeResultKind.SystemError;
                }
            })(),
            time: Math.ceil(
                userResult.time.usr * this.timeRatio + this.timeIntercept
            ),
            memory: userResult.memory,
            extraMessage: sysJudge,
        };
    }
    async clean(): Promise<void> {
        for (const agent of this.ExecutableAgents) {
            await agent.clean();
        }
        await this.fileAgent.clean();
    }
}

export class NormalJudgeAgent extends JudgeAgent {
    constructor(
        public judge: CreateJudgeArgs,
        public timeRatio: number,
        public timeIntercept: number,
        throttle: Throttle
    ) {
        super(judge, timeRatio, timeIntercept, throttle);
        if (judge.judge.type !== JudgeType.Normal) {
            throw `Wrong JudgeType ${judge.judge.type}(Should be ${JudgeType.Normal})`;
        }
    }

    async getBasicCmp(): Promise<ExecutableAgent> {
        this.checkInit();
        const cmpExecutableAgent = new ExecutableAgent(ExecType.System, {
            source: {
                hashsum:
                    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                type: "direct",
                content: "",
            },
            environment: {
                language: "cmp",
                system: "Linux",
                arch: "x64",
                options: {},
            },
            limit: this.judge.judge.user.limit,
        });
        this.ExecutableAgents.push(cmpExecutableAgent);
        await cmpExecutableAgent.init();
        await cmpExecutableAgent.compile();
        return cmpExecutableAgent;
    }

    async getResult(): Promise<JudgeResult> {
        this.checkInit();
        const [userExecutableAgent, judgeResult1] =
            await this.compileAndFillExtra(
                ExecType.Usr,
                this.judge.judge.user,
                UsrCompileResultTransformer
            );
        if (judgeResult1 !== undefined) {
            return judgeResult1;
        }
        const [cmpExecutableAgent, judgeResult2] =
            await this.compileAndFillExtra(
                ExecType.System,
                {
                    source: {
                        hashsum:
                            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                        type: "direct",
                        content: "",
                    },
                    environment: {
                        language: "cmp",
                        system: "Linux",
                        arch: "x64",
                        options: {},
                    },
                    limit: this.judge.judge.user.limit,
                },
                OtherCompileResultTransformer
            );
        if (judgeResult2 !== undefined) {
            return judgeResult2;
        }
        const result = this.judge.test?.cases?.map?.(async (value) => {
            const [inputFd, stdFd] = await Promise.all([
                this.fileAgent.getFd(value.input),
                this.fileAgent.getFd(value.output),
            ]);
            return this.throttle.withThrottle(async () => {
                const userProcess = await userExecutableAgent.exec(undefined, [
                    inputFd,
                    "pipe",
                    "pipe",
                ]);
                const compProcess = await cmpExecutableAgent.exec(undefined, [
                    userProcess.stdout,
                    "pipe",
                    "pipe",
                    stdFd,
                ]);
                const [userResult, cmpResult, cmpOut] = await Promise.all([
                    userProcess.result,
                    compProcess.result,
                    compProcess.stdout !== null
                        ? readStream(compProcess.stdout)
                        : "",
                ]);
                return this.generateCaseResult(
                    userResult,
                    this.judge.judge.user,
                    cmpResult,
                    this.judge.judge.user,
                    cmpOut
                );
            });
        });

        return {
            cases: await Promise.all(result ?? []),
            extra: this.extra,
        };
    }
}

export class SpecialJudgeAgent extends JudgeAgent {
    constructor(
        public judge: CreateJudgeArgs,
        public timeRatio: number,
        public timeIntercept: number,
        throttle: Throttle
    ) {
        super(judge, timeRatio, timeIntercept, throttle);
        if (judge.judge.type !== JudgeType.Special) {
            throw `Wrong JudgeType ${judge.judge.type}(Should be ${JudgeType.Special})`;
        }
    }

    async getResult(): Promise<JudgeResult> {
        this.checkInit();
        if (this.judge.judge.type !== JudgeType.Special) {
            throw `Wrong JudgeType ${this.judge.judge.type}(Should be ${JudgeType.Special})`;
        }
        const [userExecutableAgent, judgeResult1] =
            await this.compileAndFillExtra(
                ExecType.Usr,
                this.judge.judge.user,
                UsrCompileResultTransformer
            );
        if (judgeResult1 !== undefined) {
            return judgeResult1;
        }
        const [spjExecutableAgent, judgeResult2] =
            await this.compileAndFillExtra(
                ExecType.Spj,
                this.judge.judge.spj,
                OtherCompileResultTransformer
            );
        if (judgeResult2 !== undefined) {
            return judgeResult2;
        }

        const result = this.judge.test?.cases?.map?.(async (value) => {
            const [inputFd, inputFd2, stdFd] = await Promise.all([
                this.fileAgent.getFd(value.input),
                this.fileAgent.getFd(value.input),
                this.fileAgent.getFd(value.output),
            ]);
            return this.throttle.withThrottle(async () => {
                const userProcess = await userExecutableAgent.exec(undefined, [
                    // "pipe",
                    inputFd,
                    "pipe",
                    "pipe",
                ]);

                const compProcess = await spjExecutableAgent.exec(undefined, [
                    userProcess.stdout,
                    "pipe",
                    "pipe",
                    inputFd2,
                    stdFd,
                ]);
                // inputStream2.pipe(userProcess.stdio[2]as unknown as Writable)
                // stdStream.pipe(userProcess.stdio[3]as unknown as Writable)
                const [userResult, cmpResult, cmpOut] = await Promise.all([
                    userProcess.result,
                    compProcess.result,
                    compProcess.stdout !== null
                        ? readStream(compProcess.stdout)
                        : "",
                ]);
                console.log(cmpOut);
                return this.generateCaseResult(
                    userResult,
                    this.judge.judge.user,
                    cmpResult,
                    this.judge.judge.user,
                    cmpOut
                );
            });
        });

        return {
            cases: await Promise.all(result ?? []),
            extra: this.extra,
        };
    }
}

export class InteractiveJudgeAgent extends JudgeAgent {
    constructor(
        public judge: CreateJudgeArgs,
        public timeRatio: number,
        public timeIntercept: number,
        throttle: Throttle
    ) {
        super(judge, timeRatio, timeIntercept, throttle);
        if (judge.judge.type !== JudgeType.Interactive) {
            throw `Wrong JudgeType ${judge.judge.type}(Should be ${JudgeType.Interactive})`;
        }
    }

    async getResult(): Promise<JudgeResult> {
        this.checkInit();
        if (this.judge.judge.type !== JudgeType.Interactive) {
            throw `Wrong JudgeType ${this.judge.judge.type}(Should be ${JudgeType.Interactive})`;
        }
        const [userExecutableAgent, judgeResult1] =
            await this.compileAndFillExtra(
                ExecType.Usr,
                this.judge.judge.user,
                UsrCompileResultTransformer
            );
        if (judgeResult1 !== undefined) {
            return judgeResult1;
        }
        const [interactorExecutableAgent, judgeResult2] =
            await this.compileAndFillExtra(
                ExecType.Interactor,
                this.judge.judge.interactor,
                OtherCompileResultTransformer
            );
        if (judgeResult2 !== undefined) {
            return judgeResult2;
        }

        const result = this.judge.test?.cases?.map?.(async (value) => {
            const [inputFd, stdFd] = await Promise.all([
                this.fileAgent.getFd(value.input),
                this.fileAgent.getFd(value.output),
            ]);
            return this.throttle.withThrottle(async () => {
                const userProcess = await userExecutableAgent.exec(undefined, [
                    "pipe",
                    "pipe",
                    "pipe",
                ]);

                const compProcess = await interactorExecutableAgent.exec(
                    undefined,
                    [
                        userProcess.stdout,
                        userProcess.stdin,
                        "pipe",
                        inputFd,
                        stdFd,
                        "pipe",
                    ]
                );
                const [userResult, cmpResult, cmpOut] = await Promise.all([
                    userProcess.result,
                    compProcess.result,
                    compProcess.stdio[5]
                        ? readStream(compProcess.stdio[5] as Readable)
                        : "",
                ]);
                return this.generateCaseResult(
                    userResult,
                    this.judge.judge.user,
                    cmpResult,
                    this.judge.judge.user,
                    cmpOut
                );
            });
        });

        return {
            cases: await Promise.all(result ?? []),
            extra: this.extra,
        };
    }
}

export class JudgeFactory {
    constructor(
        readonly timeRatio: number,
        readonly timeIntercept: number,
        readonly throttle: Throttle
    ) {}

    getJudgerAgent(judge: CreateJudgeArgs): JudgeAgent {
        // why so ugly? just reduce further bugs
        judge.judge.user.limit.compiler.cpuTime = Math.ceil(
            judge.judge.user.limit.compiler.cpuTime / this.timeRatio
        );
        judge.judge.user.limit.runtime.cpuTime = Math.ceil(
            judge.judge.user.limit.runtime.cpuTime / this.timeRatio
        );
        switch (judge.judge.type) {
            case JudgeType.Normal: {
                return new NormalJudgeAgent(
                    judge,
                    this.timeRatio,
                    this.timeIntercept,
                    this.throttle
                );
            }
            case JudgeType.Special: {
                judge.judge.spj.limit.compiler.cpuTime = Math.ceil(
                    judge.judge.spj.limit.compiler.cpuTime / this.timeRatio
                );
                judge.judge.spj.limit.runtime.cpuTime = Math.ceil(
                    judge.judge.spj.limit.runtime.cpuTime / this.timeRatio
                );
                return new SpecialJudgeAgent(
                    judge,
                    this.timeRatio,
                    this.timeIntercept,
                    this.throttle
                );
            }
            case JudgeType.Interactive: {
                judge.judge.interactor.limit.compiler.cpuTime = Math.ceil(
                    judge.judge.interactor.limit.compiler.cpuTime /
                        this.timeRatio
                );
                judge.judge.interactor.limit.runtime.cpuTime = Math.ceil(
                    judge.judge.interactor.limit.runtime.cpuTime /
                        this.timeRatio
                );
                return new InteractiveJudgeAgent(
                    judge,
                    this.timeRatio,
                    this.timeIntercept,
                    this.throttle
                );
            }
            default:
                throw "Unkown JudgeType";
        }
    }
}

export async function getJudgerFactory(
    judgerConfig: JudgeFactoryConfig,
    throttle: Throttle
): Promise<JudgeFactory> {
    const logger = getLogger("JudgeFactoryFactory");
    logger.info("self test loaded");
    const timeIntercept = 0;
    let judgerFactory = new JudgeFactory(1, 0, throttle);

    let costTime = 0,
        expectedTime = 0;

    logger.warn("start preheat");

    // 预热
    for (let round = 0; round < getConfig().judger.selfTestRound; round++) {
        await Promise.all(
            Tests.map(async (test) => {
                const judgeAgent = judgerFactory.getJudgerAgent(
                    JSON.parse(JSON.stringify(test.task))
                );
                await judgeAgent.init();
                const result = await judgeAgent.getResultNoException();
                await judgeAgent.clean();
                result.cases.forEach((c, idx) => {
                    const expectedResult = test.expectedResult[idx];
                    if (expectedResult.expectResultType !== c.kind) {
                        throw `Preheat judge result type error, test round: ${round}, test: ${test.name}, case: ${idx}, expected: ${expectedResult.expectResultType}, get: ${c.kind}`;
                    }
                });
            })
        );
    }

    logger.warn("start self test");

    // 统计
    for (let round = 0; round < getConfig().judger.selfTestRound; round++) {
        await Promise.all(
            Tests.map(async (test) => {
                const judgeAgent = judgerFactory.getJudgerAgent(
                    JSON.parse(JSON.stringify(test.task))
                );
                await judgeAgent.init();
                const result = await judgeAgent.getResultNoException();
                await judgeAgent.clean();
                result.cases.forEach((c, idx) => {
                    const expectedResult = test.expectedResult[idx];
                    if (expectedResult.expectResultType !== c.kind) {
                        throw `Self test judge result type error, test round: ${round}, test: ${test.name}, case: ${idx}, expected: ${expectedResult.expectResultType}, get: ${c.kind}`;
                    }
                    if (expectedResult.count) {
                        costTime += c.time;
                        expectedTime += expectedResult.expectedTime;
                    }
                });
            })
        );
    }

    let timeRatio = 1;
    if (expectedTime && costTime) {
        timeRatio = expectedTime / costTime;
    }
    logger.warn(`timeRatio is ${timeRatio}`);
    judgerFactory = new JudgeFactory(timeRatio, timeIntercept, throttle);

    // 校验
    for (let round = 0; round < getConfig().judger.selfTestRound; round++) {
        await Promise.all(
            Tests.map(async (test) => {
                const judgeAgent = judgerFactory.getJudgerAgent(
                    JSON.parse(JSON.stringify(test.task))
                );
                await judgeAgent.init();
                const result = await judgeAgent.getResultNoException();
                await judgeAgent.clean();
                result.cases.forEach((c, idx) => {
                    const expectedResult = test.expectedResult[idx];
                    if (expectedResult.expectResultType !== c.kind) {
                        throw `Second round self test judge result type error, test round: ${round}, test: ${test.name}, case: ${idx}, expected: ${expectedResult.expectResultType}, get: ${c.kind}`;
                    }
                    if (expectedResult.count) {
                        const diff = Math.abs(
                            expectedResult.expectedTime - c.time
                        );
                        const percentage = diff / expectedResult.expectedTime;
                        if (diff > 200 || percentage > 0.15) {
                            throw `Second round self test, system instable, test round: ${round}, test: ${test.name}, case: ${idx}, diff: ${diff}, percentage: ${percentage}`;
                        }
                    }
                });
            })
        );
    }
    logger.warn(`timeRatio is ${timeRatio}`);
    return judgerFactory;
}
