import {
    Executable,
    JudgeCaseResult,
    JudgeResult,
    JudgeResultKind,
    JudgeState,
    JudgeType,
    TestCase,
    TestPolicy,
} from "heng-protocol";
import { CreateJudgeArgs } from "heng-protocol/internal-protocol/ws";
import path from "path";
import fs from "fs";
import os from "os";
import { getLogger } from "log4js";
import { getConfig } from "../Config";
import { FileAgent, readStream } from "./File";
import { Throttle } from "./Throttle";
import { Tests } from "../SelfTest";
import { Readable } from "stream";
import { CompileLogName, ExecutableAgent } from "./ExecutableAgent";
import { ExecType } from "../Spawn/Language/decl";
import { range } from "lodash";
import { Controller } from "src/controller";
import { stat } from "./Statistics";
import * as crypto from "crypto";
import { FileHandle } from "fs/promises";
import { EmptyMeterResult, MeterResult } from "../Spawn/Meter";

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

const signalToString: Record<number, string> = {
    2: "SIGINT",
    4: "非法指令",
    6: "异常终止",
    8: "错误算术运算",
    11: "非法内存访问（分段错误）",
    15: "SIGTERM",
};

export abstract class JudgeAgent {
    protected ExecutableAgents: ExecutableAgent[] = [];
    protected fileAgent: FileAgent;
    protected logger = getLogger("JudgeAgent");
    protected Initialized = 0;
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
        protected readonly judge: CreateJudgeArgs,
        protected readonly timeRatio: number,
        protected readonly timeIntercept: number,
        protected readonly throttle: Throttle,
        protected readonly controller?: Controller
    ) {
        this.fileAgent = new FileAgent(
            path.join("workspace", judge.id),
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
        this.Initialized++;
    }

    protected checkInit(): void {
        if (this.Initialized !== 1) {
            throw new Error("Don't forget to call init or init multiple times");
        }
    }

    protected async updateStatus(judgeState: JudgeState): Promise<void> {
        if (this.controller) {
            await this.controller.do("UpdateJudges", {
                id: this.judge.id,
                state: judgeState,
            });
        }
    }

    protected async runJudge(
        judgeFunction: (testCase: TestCase) => Promise<JudgeCaseResult>
    ): Promise<JudgeCaseResult[]> {
        const judgeCaseResults: JudgeCaseResult[] = [];
        if (this.judge.test) {
            for (const testCase of this.judge.test.cases) {
                const caseResult = await judgeFunction(testCase);
                judgeCaseResults.push(caseResult);
                if (
                    caseResult.kind !== JudgeResultKind.Accepted &&
                    this.judge.test.policy !== TestPolicy.All
                ) {
                    break;
                }
            }
        }
        while (judgeCaseResults.length < (this.judge.test?.cases.length ?? 1)) {
            judgeCaseResults.push({
                kind: JudgeResultKind.Unjudged,
                time: 0,
                memory: 0,
            });
        }
        return judgeCaseResults;
    }

    protected transformTime(rawTime: number): number {
        return Math.ceil(rawTime * this.timeRatio + this.timeIntercept);
    }

    protected async compileAndFillExtra(
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
        const compileResult = await this.throttle.withThrottle(() => {
            return executableAgent.compile();
        });
        if (compileResult !== undefined) {
            const compileSumTime =
                compileResult.time.sys + compileResult.time.usr;
            const exteaInfo = {
                compileTime: this.transformTime(compileSumTime),
                compileMessage: await readStream(
                    fs.createReadStream(
                        await executableAgent.fileAgent.getPath(CompileLogName),
                        {
                            encoding: "utf-8",
                            end: Math.min(
                                executable.limit.compiler.message,
                                10 * 1024
                            ),
                        }
                    ),
                    -1
                ),
            };
            if (execType === ExecType.Usr) {
                this.extra.user = exteaInfo;
            } else if (execType === ExecType.Spj) {
                this.extra.spj = exteaInfo;
            } else if (execType === ExecType.Interactive) {
                this.extra.interactor = exteaInfo;
            }
            let compileJudgeType: JudgeResultKind | undefined = undefined;
            if (compileResult.signal === 25) {
                compileJudgeType = transformer.ole;
            } else if (
                compileSumTime > executable.limit.compiler.cpuTime ||
                (compileResult.time.real > executable.limit.compiler.cpuTime &&
                    compileResult.returnCode === -1 &&
                    compileResult.signal === 9)
            ) {
                compileJudgeType = transformer.tle;
            } else if (
                compileResult.memory >= executable.limit.compiler.memory
            ) {
                compileJudgeType = transformer.mle;
            } else if (
                compileResult.signal !== -1 ||
                compileResult.returnCode !== 0
            ) {
                compileJudgeType = transformer.ce;
            }
            let judgeResult: JudgeResult | undefined = undefined;
            if (compileJudgeType !== undefined) {
                const e: JudgeCaseResult = {
                    kind: compileJudgeType,
                    time: 0,
                    memory: 0,
                };
                judgeResult = {
                    cases: range(this.judge.test?.cases.length ?? 1).map(
                        () => e
                    ),
                    extra: this.extra,
                };
            }
            return [executableAgent, judgeResult];
        } else {
            return [executableAgent, undefined];
        }
    }

    protected abstract getResult(): Promise<JudgeResult>;

    async getResultNoException(): Promise<JudgeResult> {
        // this.checkInit();
        try {
            stat.tick(this.judge.id);
            await this.init();
            const ret = await this.getResult();
            await this.clean();
            stat.finish(this.judge.id);
            return ret;
        } catch (err) {
            this.logger.fatal(err);
            await this.clean().catch((error) => {
                this.logger.fatal(error);
            });
            stat.finish(this.judge.id);
            const e = {
                kind: JudgeResultKind.SystemError,
                time: 0,
                memory: 0,
                extraMessage: String(err),
            };
            return {
                cases: range(this.judge.test?.cases.length ?? 1).map(() => e),
            };
        }
    }

    protected preDetect(
        userResult: MeterResult,
        userExec: Executable
    ): JudgeResultKind | undefined {
        const userRunSumTime = userResult.time.usr + userResult.time.sys;
        if (userResult.signal === 25) {
            return JudgeResultKind.OutpuLimitExceeded;
        } else if (
            userRunSumTime > userExec.limit.runtime.cpuTime ||
            (userResult.time.real > userExec.limit.runtime.cpuTime &&
                userResult.returnCode === -1 &&
                userResult.signal === 9)
        ) {
            return JudgeResultKind.TimeLimitExceeded;
        } else if (userResult.memory >= userExec.limit.runtime.memory) {
            return JudgeResultKind.MemoryLimitExceeded;
        } else if (userResult.signal !== -1 || userResult.returnCode !== 0) {
            return JudgeResultKind.RuntimeError;
        }
        return undefined;
    }

    protected generateCaseResult({
        userResult,
        userExec,
        sysResult,
        sysExec,
        // userErr,
        sysOut,
        sysErr,
    }: {
        userResult: MeterResult;
        userExec: Executable;
        sysResult: MeterResult;
        sysExec: Executable;
        userErr: string;
        sysOut: string;
        sysErr: string;
    }): JudgeCaseResult {
        this.checkInit();
        sysOut = sysOut.trim();
        sysErr = sysErr.trim();
        let sysJudge = "";
        if (sysOut) {
            sysJudge += sysOut;
        }
        if (sysErr) {
            sysJudge += sysErr;
        }
        const sysSummary = sysJudge.slice(0, 4).toLocaleLowerCase();
        const userRunSumTime = userResult.time.usr + userResult.time.sys;
        const sysRunSumTime = sysResult.time.usr + sysResult.time.sys;
        const kind = ((): JudgeResultKind => {
            if (userResult.signal === 25) {
                return JudgeResultKind.OutpuLimitExceeded;
            } else if (
                userRunSumTime > userExec.limit.runtime.cpuTime ||
                (userResult.time.real > userExec.limit.runtime.cpuTime &&
                    userResult.returnCode === -1 &&
                    userResult.signal === 9)
            ) {
                return JudgeResultKind.TimeLimitExceeded;
            } else if (userResult.memory >= userExec.limit.runtime.memory) {
                return JudgeResultKind.MemoryLimitExceeded;
            } else if (
                userResult.signal !== -1 ||
                userResult.returnCode !== 0
            ) {
                sysJudge += signalToString[userResult.signal] ?? "";
                return JudgeResultKind.RuntimeError;
            } else if (sysResult.signal === 25) {
                return JudgeResultKind.SystemOutpuLimitExceeded;
            } else if (
                sysRunSumTime > sysExec.limit.runtime.cpuTime ||
                (sysResult.time.real > sysExec.limit.runtime.cpuTime &&
                    sysResult.returnCode === -1 &&
                    sysResult.signal === 9)
            ) {
                return JudgeResultKind.SystemTimeLimitExceeded;
            } else if (sysResult.memory > sysExec.limit.runtime.memory) {
                return JudgeResultKind.SystemMemoryLimitExceeded;
            } else if (
                sysResult.signal !== -1 ||
                !range(9).includes(sysResult.returnCode)
            ) {
                return JudgeResultKind.SystemRuntimeError;
            } else if (
                (sysSummary.startsWith("ac") || sysSummary.startsWith("ok")) &&
                sysResult.returnCode === 0
            ) {
                return JudgeResultKind.Accepted;
            } else if (
                sysSummary.startsWith("pe") &&
                sysResult.returnCode === 2
            ) {
                return JudgeResultKind.PresentationError;
            } else {
                return JudgeResultKind.WrongAnswer;
            }
        })();
        const rawTime = userRunSumTime;
        // sleep(inf);
        // codeforces: Idleness limit exceeded, time: 0ms
        // luogu: TLE, time: 1ms
        // if (kind === JudgeResultKind.TimeLimitExceeded) {
        //     if (!(userResult.time.usr > userExec.limit.runtime.cpuTime))
        //         rawTime = userResult.time.real;
        // }
        return {
            kind,
            time: this.transformTime(rawTime),
            memory: userResult.memory,
            extraMessage: sysJudge,
        };
    }

    async clean(): Promise<void> {
        for (const executableAgent of this.ExecutableAgents) {
            await executableAgent.clean();
        }
        await this.fileAgent.clean();
    }
}

export class NormalJudgeAgent extends JudgeAgent {
    constructor(
        protected readonly judge: CreateJudgeArgs,
        protected readonly timeRatio: number,
        protected readonly timeIntercept: number,
        protected readonly throttle: Throttle,
        protected readonly controller?: Controller
    ) {
        super(judge, timeRatio, timeIntercept, throttle, controller);
    }

    protected async getResult(): Promise<JudgeResult> {
        this.checkInit();
        if (this.judge.judge.type !== JudgeType.Normal) {
            throw new Error(
                `Wrong JudgeType ${this.judge.judge.type}(Should be ${JudgeType.Normal})`
            );
        }

        this.updateStatus(JudgeState.Preparing);
        stat.tick(this.judge.id);

        const [userExecutableAgent, judgeResult1] =
            await this.compileAndFillExtra(
                ExecType.Usr,
                this.judge.judge.user,
                UsrCompileResultTransformer
            );
        if (judgeResult1 !== undefined) {
            return judgeResult1;
        }
        const cmpExec: Executable = {
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
        };
        const [cmpExecutableAgent, judgeResult2] =
            await this.compileAndFillExtra(
                ExecType.System,
                cmpExec,
                OtherCompileResultTransformer
            );
        if (judgeResult2 !== undefined) {
            return judgeResult2;
        }

        this.updateStatus(JudgeState.Judging);
        stat.tick(this.judge.id);

        const caseResults = await this.runJudge(async (testCase) => {
            const userOutputFilePath = path.join(
                this.fileAgent.dir,
                crypto.randomBytes(32).toString("hex")
            );
            let stdInputFH: FileHandle | undefined = undefined;
            let userOutputFH_W: FileHandle | undefined = undefined;
            let userOutputFH_R: FileHandle | undefined = undefined;
            let stdOutputFH: FileHandle | undefined = undefined;

            try {
                [stdInputFH, userOutputFH_W] = await Promise.all([
                    this.fileAgent.getFileHandler(testCase.input),
                    fs.promises.open(userOutputFilePath, "w", 0o700),
                ]);
                const [userResult, userErr] = await this.throttle.withThrottle(
                    async () => {
                        if (
                            stdInputFH === undefined ||
                            userOutputFH_W === undefined
                        )
                            throw new Error("Unreachable code");
                        const userProcess = await userExecutableAgent.exec(
                            undefined,
                            [stdInputFH.fd, userOutputFH_W.fd, "ignore"]
                        );
                        return await Promise.all([
                            userProcess.result,
                            userProcess.stderr !== null
                                ? readStream(userProcess.stderr, 1024)
                                : "",
                        ]);
                    }
                );
                await stdInputFH.close(), await userOutputFH_W.close();

                if (
                    this.preDetect(userResult, this.judge.judge.user) !==
                    undefined
                ) {
                    return this.generateCaseResult({
                        userResult: userResult,
                        userExec: this.judge.judge.user,
                        sysResult: EmptyMeterResult,
                        sysExec: cmpExec,
                        userErr: userErr,
                        sysOut: "",
                        sysErr: "",
                    });
                }

                [userOutputFH_R, stdOutputFH] = await Promise.all([
                    fs.promises.open(userOutputFilePath, "r", 0o700),
                    this.fileAgent.getFileHandler(testCase.output),
                ]);
                const [cmpResult, cmpOut, cmpErr] =
                    await this.throttle.withThrottle(async () => {
                        if (
                            userOutputFH_R === undefined ||
                            stdOutputFH === undefined
                        )
                            throw new Error("Unreachable code");
                        const compProcess = await cmpExecutableAgent.exec(
                            undefined,
                            [userOutputFH_R.fd, "pipe", "pipe", stdOutputFH.fd]
                        );
                        const r = await Promise.all([
                            compProcess.result,
                            compProcess.stdout !== null
                                ? readStream(compProcess.stdout, 1024)
                                : "",
                            compProcess.stderr !== null
                                ? readStream(compProcess.stderr, 1024)
                                : "",
                        ]);
                        compProcess.stdout !== null &&
                            compProcess.stdout.destroy();
                        compProcess.stderr !== null &&
                            compProcess.stderr.destroy();
                        return r;
                    });
                await userOutputFH_R.close(), await stdOutputFH.close();

                return this.generateCaseResult({
                    userResult: userResult,
                    userExec: this.judge.judge.user,
                    sysResult: cmpResult,
                    sysExec: cmpExec,
                    userErr: userErr,
                    sysOut: cmpOut,
                    sysErr: cmpErr,
                });
            } finally {
                stdInputFH && (await stdInputFH.close());
                userOutputFH_W && (await userOutputFH_W.close());
                userOutputFH_R && (await userOutputFH_R.close());
                stdOutputFH && (await stdOutputFH.close());
            }
        });

        return {
            cases: caseResults,
            extra: this.extra,
        };
    }
}

export class SpecialJudgeAgent extends JudgeAgent {
    constructor(
        protected readonly judge: CreateJudgeArgs,
        protected readonly timeRatio: number,
        protected readonly timeIntercept: number,
        protected readonly throttle: Throttle,
        protected readonly controller?: Controller
    ) {
        super(judge, timeRatio, timeIntercept, throttle, controller);
    }

    protected async getResult(): Promise<JudgeResult> {
        this.checkInit();
        if (this.judge.judge.type !== JudgeType.Special) {
            throw new Error(
                `Wrong JudgeType ${this.judge.judge.type}(Should be ${JudgeType.Special})`
            );
        }

        this.updateStatus(JudgeState.Preparing);
        stat.tick(this.judge.id);

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

        this.updateStatus(JudgeState.Judging);
        stat.tick(this.judge.id);

        const caseResults = await this.runJudge(async (testCase) => {
            if (this.judge.judge.type !== JudgeType.Special) {
                throw new Error(
                    `Wrong JudgeType ${this.judge.judge.type}(Should be ${JudgeType.Special})`
                );
            }

            const userOutputFilePath = path.join(
                this.fileAgent.dir,
                crypto.randomBytes(32).toString("hex")
            );
            let stdInputFH: FileHandle | undefined = undefined;
            let stdInputFH2: FileHandle | undefined = undefined;
            let userOutputFH_W: FileHandle | undefined = undefined;
            let userOutputFH_R: FileHandle | undefined = undefined;
            let stdOutputFH: FileHandle | undefined = undefined;

            try {
                [stdInputFH, userOutputFH_W] = await Promise.all([
                    this.fileAgent.getFileHandler(testCase.input),
                    fs.promises.open(userOutputFilePath, "w", 0o700),
                ]);
                const [userResult, userErr] = await this.throttle.withThrottle(
                    async () => {
                        if (
                            stdInputFH === undefined ||
                            userOutputFH_W === undefined
                        )
                            throw new Error("Unreachable code");
                        const userProcess = await userExecutableAgent.exec(
                            undefined,
                            [stdInputFH.fd, userOutputFH_W.fd, "ignore"]
                        );
                        return await Promise.all([
                            userProcess.result,
                            userProcess.stderr !== null
                                ? readStream(userProcess.stderr, 1024)
                                : "",
                        ]);
                    }
                );
                await stdInputFH.close(), await userOutputFH_W.close();

                if (
                    this.preDetect(userResult, this.judge.judge.user) !==
                    undefined
                ) {
                    return this.generateCaseResult({
                        userResult: userResult,
                        userExec: this.judge.judge.user,
                        sysResult: EmptyMeterResult,
                        sysExec: this.judge.judge.spj,
                        userErr: userErr,
                        sysOut: "",
                        sysErr: "",
                    });
                }

                [userOutputFH_R, stdInputFH2, stdOutputFH] = await Promise.all([
                    fs.promises.open(userOutputFilePath, "r", 0o700),
                    this.fileAgent.getFileHandler(testCase.input),
                    this.fileAgent.getFileHandler(testCase.output),
                ]);
                const [cmpResult, cmpOut, cmpErr] =
                    await this.throttle.withThrottle(async () => {
                        if (
                            stdInputFH2 === undefined ||
                            userOutputFH_R === undefined ||
                            stdOutputFH === undefined
                        )
                            throw new Error("Unreachable code");
                        const compProcess = await spjExecutableAgent.exec(
                            undefined,
                            [
                                userOutputFH_R.fd,
                                "pipe",
                                "pipe",
                                stdInputFH2.fd,
                                stdOutputFH.fd,
                            ]
                        );
                        const r = await Promise.all([
                            compProcess.result,
                            compProcess.stdout !== null
                                ? readStream(compProcess.stdout, 1024)
                                : "",
                            compProcess.stderr !== null
                                ? readStream(compProcess.stderr, 1024)
                                : "",
                        ]);
                        compProcess.stdout !== null &&
                            compProcess.stdout.destroy();
                        compProcess.stderr !== null &&
                            compProcess.stderr.destroy();
                        return r;
                    });
                await userOutputFH_R.close();
                await stdInputFH2.close();
                await stdOutputFH.close();

                return this.generateCaseResult({
                    userResult: userResult,
                    userExec: this.judge.judge.user,
                    sysResult: cmpResult,
                    sysExec: this.judge.judge.spj,
                    userErr: userErr,
                    sysOut: cmpOut,
                    sysErr: cmpErr,
                });
            } finally {
                stdInputFH && (await stdInputFH.close());
                userOutputFH_W && (await userOutputFH_W.close());
                userOutputFH_R && (await userOutputFH_R.close());
                stdInputFH2 && (await stdInputFH2.close());
                stdOutputFH && (await stdOutputFH.close());
            }
        });

        return {
            cases: caseResults,
            extra: this.extra,
        };
    }
}

export class InteractiveJudgeAgent extends JudgeAgent {
    constructor(
        protected readonly judge: CreateJudgeArgs,
        protected readonly timeRatio: number,
        protected readonly timeIntercept: number,
        protected readonly throttle: Throttle,
        protected readonly controller?: Controller
    ) {
        super(judge, timeRatio, timeIntercept, throttle, controller);
    }

    protected async getResult(): Promise<JudgeResult> {
        this.checkInit();
        if (this.judge.judge.type !== JudgeType.Interactive) {
            throw new Error(
                `Wrong JudgeType ${this.judge.judge.type}(Should be ${JudgeType.Interactive})`
            );
        }

        this.updateStatus(JudgeState.Preparing);
        stat.tick(this.judge.id);

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
                ExecType.Interactive,
                this.judge.judge.interactor,
                OtherCompileResultTransformer
            );
        if (judgeResult2 !== undefined) {
            return judgeResult2;
        }

        this.updateStatus(JudgeState.Judging);
        stat.tick(this.judge.id);

        const caseResults = await this.runJudge(async (testCase) => {
            if (this.judge.judge.type !== JudgeType.Interactive) {
                throw new Error(
                    `Wrong JudgeType ${this.judge.judge.type}(Should be ${JudgeType.Interactive})`
                );
            }
            let stdInputFH: FileHandle | undefined = undefined;
            let stdOutputFH: FileHandle | undefined = undefined;
            try {
                [stdInputFH, stdOutputFH] = await Promise.all([
                    this.fileAgent.getFileHandler(testCase.input),
                    this.fileAgent.getFileHandler(testCase.output),
                ]);
                const [userResult, cmpResult, userErr, cmpOut, cmpErr] =
                    await this.throttle.withThrottle(async () => {
                        if (
                            stdInputFH === undefined ||
                            stdOutputFH === undefined
                        )
                            throw new Error("Unreachable code");
                        const userProcess = await userExecutableAgent.exec(
                            undefined,
                            ["pipe", "pipe", "ignore"]
                        );
                        const compProcess =
                            await interactorExecutableAgent.exec(undefined, [
                                userProcess.stdout,
                                userProcess.stdin,
                                "pipe",
                                stdInputFH.fd,
                                stdOutputFH.fd,
                                "ignore",
                            ]);
                        const r = await Promise.all([
                            userProcess.result,
                            compProcess.result,
                            userProcess.stderr !== null
                                ? readStream(userProcess.stderr, 1024)
                                : "",
                            (compProcess.stdio as unknown as Readable[])[5]
                                ? readStream(
                                      (
                                          compProcess.stdio as unknown as Readable[]
                                      )[5],
                                      1024
                                  )
                                : "",
                            compProcess.stderr !== null
                                ? readStream(compProcess.stderr, 1024)
                                : "",
                        ]);
                        userProcess.stdin !== null &&
                            userProcess.stdin.destroy();
                        userProcess.stdout !== null &&
                            userProcess.stdout.destroy();
                        compProcess.stderr !== null &&
                            compProcess.stderr.destroy();
                        return r;
                    });
                await stdInputFH.close();
                await stdOutputFH.close();

                return this.generateCaseResult({
                    userResult: userResult,
                    userExec: this.judge.judge.user,
                    sysResult: cmpResult,
                    sysExec: this.judge.judge.interactor,
                    userErr: userErr,
                    sysOut: cmpOut,
                    sysErr: cmpErr,
                });
            } finally {
                stdInputFH && (await stdInputFH.close());
                stdOutputFH && (await stdOutputFH.close());
            }
        });

        return {
            cases: caseResults,
            extra: this.extra,
        };
    }
}

export class JudgeFactory {
    constructor(
        readonly timeRatio: number,
        readonly timeIntercept: number,
        readonly throttle: Throttle,
        public controller?: Controller
    ) {}

    getJudgerAgent(judgeInfo: CreateJudgeArgs): JudgeAgent {
        judgeInfo.judge.user.limit.compiler.cpuTime = Math.ceil(
            judgeInfo.judge.user.limit.compiler.cpuTime / this.timeRatio
        );
        judgeInfo.judge.user.limit.runtime.cpuTime = Math.ceil(
            judgeInfo.judge.user.limit.runtime.cpuTime / this.timeRatio
        );
        switch (judgeInfo.judge.type) {
            case JudgeType.Normal: {
                return new NormalJudgeAgent(
                    judgeInfo,
                    this.timeRatio,
                    this.timeIntercept,
                    this.throttle,
                    this.controller
                );
            }
            case JudgeType.Special: {
                judgeInfo.judge.spj.limit.compiler.cpuTime = Math.ceil(
                    judgeInfo.judge.spj.limit.compiler.cpuTime / this.timeRatio
                );
                judgeInfo.judge.spj.limit.runtime.cpuTime = Math.ceil(
                    judgeInfo.judge.spj.limit.runtime.cpuTime / this.timeRatio
                );
                return new SpecialJudgeAgent(
                    judgeInfo,
                    this.timeRatio,
                    this.timeIntercept,
                    this.throttle,
                    this.controller
                );
            }
            case JudgeType.Interactive: {
                judgeInfo.judge.interactor.limit.compiler.cpuTime = Math.ceil(
                    judgeInfo.judge.interactor.limit.compiler.cpuTime /
                        this.timeRatio
                );
                judgeInfo.judge.interactor.limit.runtime.cpuTime = Math.ceil(
                    judgeInfo.judge.interactor.limit.runtime.cpuTime /
                        this.timeRatio
                );
                return new InteractiveJudgeAgent(
                    judgeInfo,
                    this.timeRatio,
                    this.timeIntercept,
                    this.throttle,
                    this.controller
                );
            }
            default:
                throw new Error("Unkown JudgeType");
        }
    }
}

export async function getJudgerFactory(
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
                const _test: CreateJudgeArgs = JSON.parse(
                    JSON.stringify(test.task)
                );
                _test.id = crypto.randomBytes(32).toString("hex");
                const judgeAgent = judgerFactory.getJudgerAgent(_test);
                const result = await judgeAgent.getResultNoException();
                console.log(result);
                result.cases.forEach((c, idx) => {
                    const expectedResult = test.expectedResult[idx];
                    if (
                        expectedResult.expectResultType !== c.kind &&
                        !getConfig().judger.noSelfTestError
                    ) {
                        throw new Error(
                            `Preheat judge result type error, test round: ${round}, test: ${test.name}, case: ${idx}, expected: ${expectedResult.expectResultType}, get: ${c.kind}`
                        );
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
                const _test: CreateJudgeArgs = JSON.parse(
                    JSON.stringify(test.task)
                );
                _test.id = crypto.randomBytes(32).toString("hex");
                const judgeAgent = judgerFactory.getJudgerAgent(_test);
                const result = await judgeAgent.getResultNoException();
                console.log(result);
                result.cases.forEach((c, idx) => {
                    const expectedResult = test.expectedResult[idx];
                    if (
                        expectedResult.expectResultType !== c.kind &&
                        !getConfig().judger.noSelfTestError
                    ) {
                        throw new Error(
                            `Self test judge result type error, test round: ${round}, test: ${test.name}, case: ${idx}, expected: ${expectedResult.expectResultType}, get: ${c.kind}`
                        );
                    }
                    if (expectedResult.count) {
                        costTime += c.time;
                        expectedTime += expectedResult.expectedTime;
                    }
                });
            })
        );
    }

    let timeRatio = getConfig().judger.defaultTimeRatio;
    const lastTimeRatioFileName = path.join(
        os.tmpdir(),
        "Heng_Client.timeratio"
    );
    try {
        const trStr = await fs.promises.readFile(lastTimeRatioFileName, {
            encoding: "utf-8",
        });
        const lastTimeRatio = parseFloat(trStr);
        timeRatio = lastTimeRatio;
        logger.info(
            `Succeed in loading last TimeRatio from ${lastTimeRatioFileName}`
        );
    } catch (error) {
        logger.warn(
            `Fail to load last TimeRatio from ${lastTimeRatioFileName}`
        );
    }
    if (expectedTime && costTime) {
        // reportTime = realTime * timeRatio
        timeRatio = expectedTime / costTime;
    }
    logger.warn(`timeRatio is ${timeRatio}`);
    logger.warn(
        `timeRatioTolerance is ${getConfig().judger.timeRatioTolerance}`
    );

    if (
        (timeRatio / 1.0 > getConfig().judger.timeRatioTolerance ||
            1.0 / timeRatio > getConfig().judger.timeRatioTolerance) &&
        !getConfig().judger.noSelfTestError
    ) {
        throw new Error("timeRatio exceeds timeRatioTolerance");
    }

    judgerFactory = new JudgeFactory(timeRatio, timeIntercept, throttle);

    logger.warn("start test system stability");

    // 校验
    for (let round = 0; round < getConfig().judger.selfTestRound; round++) {
        await Promise.all(
            Tests.map(async (test) => {
                const _test: CreateJudgeArgs = JSON.parse(
                    JSON.stringify(test.task)
                );
                _test.id = crypto.randomBytes(32).toString("hex");
                const judgeAgent = judgerFactory.getJudgerAgent(_test);
                const result = await judgeAgent.getResultNoException();
                console.log(result);
                result.cases.forEach((c, idx) => {
                    const expectedResult = test.expectedResult[idx];
                    if (
                        expectedResult.expectResultType !== c.kind &&
                        !getConfig().judger.noSelfTestError
                    ) {
                        throw new Error(
                            `Second round self test judge result type error, test round: ${round}, test: ${test.name}, case: ${idx}, expected: ${expectedResult.expectResultType}, get: ${c.kind}`
                        );
                    }
                    if (expectedResult.count) {
                        const diff = Math.abs(
                            expectedResult.expectedTime - c.time
                        );
                        const percentage = diff / expectedResult.expectedTime;
                        if (
                            (diff > 200 || percentage > 0.15) &&
                            !getConfig().judger.noSelfTestError
                        ) {
                            throw new Error(
                                `Second round self test, system instable, test round: ${round}, test: ${test.name}, case: ${idx}, diff: ${diff}, percentage: ${percentage}`
                            );
                        }
                    }
                });
            })
        );
    }
    logger.warn(`timeRatio is ${timeRatio}`);
    try {
        await fs.promises.writeFile(lastTimeRatioFileName, String(timeRatio), {
            mode: 0o700,
        });
        logger.info(`Succeed in writing TimeRatio to ${lastTimeRatioFileName}`);
    } catch (error) {
        logger.warn(`Fail to write TimeRatio to ${lastTimeRatioFileName}`);
    }
    return judgerFactory;
}
