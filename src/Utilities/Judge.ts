import {
    Executable,
    JudgeCaseResult,
    JudgeResult,
    JudgeResultKind,
    JudgeType,
    Limit,
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

export abstract class JudgeAgent {
    protected fileAgent: FileAgent;
    protected logger = getLogger("JudgeAgent");
    private Initialized = false;

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

    generateCompileResult(
        compileResult: JailResult,
        limit: Limit,
        transformer: {
            mle: JudgeResultKind;
            tle: JudgeResultKind;
            ole: JudgeResultKind;
            re: JudgeResultKind;
            ce: JudgeResultKind;
        }
    ) {

    }

    checkInit(): void {
        if (!this.Initialized) {
            throw new Error("Don't forget to call init");
        }
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
        this.checkInit();
        const userExecutableAgent = new ExecutableAgent(
            ExecType.Usr,
            this.judge.judge.user
        );
        await userExecutableAgent.init();
        const compileResult = await this.throttle.withThrottle(() =>
            userExecutableAgent.compile()
        );
        if (compileResult !== undefined) {
            this.getExtra = async () => ({
                user: {
                    compileTime: compileResult.time.usr,
                    compileMessage: fs
                        .readFileSync(
                            await userExecutableAgent.fileAgent.getPath(
                                CompileLogName
                            )
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
                        cases: [
                            {
                                kind: JudgeResultKind.CompileMemoryLimitExceeded,
                                time: 0,
                                memory: 0,
                            },
                        ],
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
                        cases: [
                            {
                                kind: JudgeResultKind.CompileTimeLimitExceeded,
                                time: 0,
                                memory: 0,
                            },
                        ],
                        extra: await this.getExtra(),
                    },
                    undefined,
                ];
            }
            if (compileResult.signal === 25) {
                return [
                    {
                        cases: [
                            {
                                kind: JudgeResultKind.CompileFileLimitExceeded,
                                time: 0,
                                memory: 0,
                            },
                        ],
                        extra: await this.getExtra(),
                    },
                    undefined,
                ];
            }
            if (compileResult.signal !== -1 || compileResult.returnCode !== 0) {
                return [
                    {
                        cases: [
                            {
                                kind: JudgeResultKind.CompileError,
                                time: 0,
                                memory: 0,
                            },
                        ],
                        extra: await this.getExtra(),
                    },
                    undefined,
                ];
            }
        }
        return [undefined, userExecutableAgent];
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
                        extraMessage: String(e),
                    },
                ],
            };
        }
    }

    generateResult(
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
        };
    }
    async clean(): Promise<void> {
        await this.fileAgent.clean();
    }
    // abstract getState(): JudgeStatus;
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

    getBasicCmp(usrLimit: Limit): ExecutableAgent {
        this.checkInit();
        return new ExecutableAgent(ExecType.System, {
            source: {
                hashsum: "",
                type: "direct",
                content: "",
            },
            environment: {
                language: "cmp",
                system: "Linux",
                arch: "x64",
                options: {},
            },
            limit: usrLimit,
        });
    }

    async getResult(): Promise<JudgeResult> {
        this.checkInit();
        const [compileResult, userExecutableAgent] = await this.compileUsr();
        const cmpExecutableAgent = this.getBasicCmp(
            this.judge.judge.user.limit
        );
        await cmpExecutableAgent.init();
        await cmpExecutableAgent.compile();
        if (compileResult !== undefined) {
            return compileResult;
        } else if (userExecutableAgent !== undefined) {
            const result = this.judge.test?.cases?.map?.(async (value) => {
                const [inputFd, stdFd] = await Promise.all([
                    this.fileAgent.getFd(value.input),
                    this.fileAgent.getFd(value.output),
                ]);
                return this.throttle.withThrottle(async () => {
                    const userProcess = await userExecutableAgent.exec(
                        undefined,
                        [
                            inputFd,
                            // "pipe",
                            "pipe",
                            "pipe",
                        ]
                    );
                    // if (userProcess.stdin) {
                    //     inputStream.pipe(userProcess.stdin);
                    // }
                    // const compProcess = jailMeterSpawn(
                    //     this.cmp,
                    //     ["normal", "--user-fd", "0", "--std", stdPath],
                    //     { stdio: [userProcess.stdout, "pipe", "pipe"] },
                    //     {
                    //         timelimit: this.judge.judge.user.limit.runtime
                    //             .cpuTime,
                    //         memorylimit: this.judge.judge.user.limit.runtime
                    //             .memory,
                    //         pidlimit: getConfig().judger.defaultPidLimit,
                    //         filelimit: this.judge.judge.user.limit.runtime
                    //             .output,
                    //         mount: [{ path: stdPath, mode: "ro" }],
                    //     }
                    // );
                    const compProcess = await cmpExecutableAgent.exec(
                        undefined,
                        [userProcess.stdout, "pipe", "pipe", stdFd]
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
            });

            return {
                cases: await Promise.all(result ?? []),
                extra: await this.getExtra(),
            };
        } else {
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
    async compileSpj(): Promise<
        [JudgeResult, undefined] | [undefined, ExecutableAgent]
    > {
        this.checkInit();
        if (this.judge.judge.type != JudgeType.Special) {
            throw `Wrong JudgeType ${this.judge.judge.type}(Should be ${JudgeType.Special})`;
        }
        const userExecutableAgent = new ExecutableAgent(
            ExecType.Spj,
            this.judge.judge.spj
        );
        const compileResult = await this.throttle.withThrottle(
            async () => await userExecutableAgent.compile()
        );
        if (compileResult !== undefined) {
            const oldExtra = this.getExtra;
            this.getExtra = async () => ({
                spj: {
                    compileTime: compileResult.time.usr,
                    compileMessage: fs
                        .readFileSync(
                            await this.fileAgent.getPath("spj:compile-log")
                        )
                        .toString(),
                },
                user: (await oldExtra()).user,
            });
            if (
                compileResult.memory >
                this.judge.judge.user.limit.compiler.memory
            ) {
                return [
                    {
                        cases: [
                            {
                                kind: JudgeResultKind.SystemCompileError,
                                time: 0,
                                memory: 0,
                            },
                        ],
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
                        cases: [
                            {
                                kind: JudgeResultKind.SystemCompileError,
                                time: 0,
                                memory: 0,
                            },
                        ],
                        extra: await this.getExtra(),
                    },
                    undefined,
                ];
            }
            if (compileResult.signal === 25) {
                return [
                    {
                        cases: [
                            {
                                kind: JudgeResultKind.SystemCompileError,
                                time: 0,
                                memory: 0,
                            },
                        ],
                        extra: await this.getExtra(),
                    },
                    undefined,
                ];
            }
            if (compileResult.signal !== -1 || compileResult.returnCode !== 0) {
                return [
                    {
                        cases: [
                            {
                                kind: JudgeResultKind.SystemCompileError,
                                time: 0,
                                memory: 0,
                            },
                        ],
                        extra: await this.getExtra(),
                    },
                    undefined,
                ];
            }
        }
        return [undefined, userExecutableAgent];
    }
    async getResult(): Promise<JudgeResult> {
        this.checkInit();
        const [compileResult, userExecutableAgent] = await this.compileUsr();
        const [spjCompileResult, spjExecutableAgent] = await this.compileSpj();
        if (compileResult !== undefined) {
            return compileResult;
        } else if (spjCompileResult !== undefined) {
            return spjCompileResult;
        } else if (
            userExecutableAgent !== undefined &&
            spjExecutableAgent !== undefined
        ) {
            const result = this.judge.test?.cases?.map?.(async (value) => {
                const [inputFd, inputFd2, stdFd] = await Promise.all([
                    this.fileAgent.getFd(value.input),
                    this.fileAgent.getFd(value.input),
                    this.fileAgent.getFd(value.output),
                ]);
                return this.throttle.withThrottle(async () => {
                    const userProcess = await userExecutableAgent.exec(
                        undefined,
                        [
                            // "pipe",
                            inputFd,
                            "pipe",
                            "pipe",
                        ]
                    );

                    const compProcess = await spjExecutableAgent.exec(
                        undefined,
                        [userProcess.stdout, "pipe", "pipe", inputFd2, stdFd]
                    );
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
                    return this.generateResult(
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
                extra: await this.getExtra(),
            };
        } else {
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
    async compileInteractor(): Promise<
        [JudgeResult, undefined] | [undefined, ExecutableAgent]
    > {
        this.checkInit();
        if (this.judge.judge.type != JudgeType.Interactive) {
            throw `Wrong JudgeType ${this.judge.judge.type}(Should be ${JudgeType.Interactive})`;
        }
        const interactorExecutableAgent = new ExecutableAgent(
            ExecType.Interactor,
            this.judge.judge.interactor
        );
        const compileResult = await this.throttle.withThrottle(() =>
            interactorExecutableAgent.compile()
        );
        if (compileResult !== undefined) {
            const oldExtra = this.getExtra;
            this.getExtra = async () => ({
                interactor: {
                    compileTime: compileResult.time.usr,
                    compileMessage: fs
                        .readFileSync(
                            await this.fileAgent.getPath(
                                "interactor:compile-log"
                            )
                        )
                        .toString(),
                },
                user: (await oldExtra()).user,
            });
            if (
                compileResult.memory >
                this.judge.judge.user.limit.compiler.memory
            ) {
                return [
                    {
                        cases: [
                            {
                                kind: JudgeResultKind.SystemCompileError,
                                time: 0,
                                memory: 0,
                            },
                        ],
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
                        cases: [
                            {
                                kind: JudgeResultKind.SystemCompileError,
                                time: 0,
                                memory: 0,
                            },
                        ],
                        extra: await this.getExtra(),
                    },
                    undefined,
                ];
            }
            if (compileResult.signal === 25) {
                return [
                    {
                        cases: [
                            {
                                kind: JudgeResultKind.SystemCompileError,
                                time: 0,
                                memory: 0,
                            },
                        ],
                        extra: await this.getExtra(),
                    },
                    undefined,
                ];
            }
            if (compileResult.signal !== -1 || compileResult.returnCode !== 0) {
                return [
                    {
                        cases: [
                            {
                                kind: JudgeResultKind.SystemCompileError,
                                time: 0,
                                memory: 0,
                            },
                        ],
                        extra: await this.getExtra(),
                    },
                    undefined,
                ];
            }
        }
        return [undefined, interactorExecutableAgent];
    }
    async getResult(): Promise<JudgeResult> {
        this.checkInit();
        const [compileResult, userExecutableAgent] = await this.compileUsr();
        const [spjCompileResult, interactorExecutableAgent] =
            await this.compileInteractor();
        if (compileResult !== undefined) {
            return compileResult;
        } else if (spjCompileResult !== undefined) {
            return spjCompileResult;
        } else if (
            userExecutableAgent !== undefined &&
            interactorExecutableAgent !== undefined
        ) {
            const result = this.judge.test?.cases?.map?.(async (value) => {
                const [inputFd, stdFd] = await Promise.all([
                    this.fileAgent.getFd(value.input),
                    this.fileAgent.getFd(value.output),
                ]);
                return this.throttle.withThrottle(async () => {
                    const userProcess = await userExecutableAgent.exec(
                        undefined,
                        ["pipe", "pipe", "pipe"]
                    );

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
                    return this.generateResult(
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
                extra: await this.getExtra(),
            };
        } else {
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
