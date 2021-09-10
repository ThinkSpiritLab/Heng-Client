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
import { ConfiguredLanguage, getLanguage } from "../Spawn/Language";
import { FileAgent, readStream, waitForOpen } from "./File";
import { jailMeterSpawn } from "../Spawn";
import { MeteredChildProcess, MeterResult } from "../Spawn/Meter";
import { StdioType } from "src/Spawn/BasicSpawn";
import { Throttle } from "./Throttle";
import { Tests } from "../SelfTest";
import { Readable } from "stream";

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
        readonly cwdPrefix: string,
        private uid: number,
        private gid: number
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

    async compile(includeTestlib = false): Promise<MeterResult | void> {
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
            if (includeTestlib) {
                await fs.promises.copyFile(
                    path.resolve(getConfig().language.testlib),
                    path.resolve(
                        this.fileAgent.dir,
                        this.cwdPrefix,
                        "testlib.h"
                    )
                );
            }
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
                    uid: this.uid,
                    gid: this.gid,
                },
                {
                    timelimit:
                        this.excutable.limit.compiler.cpuTime +
                        getConfig().judger.tleTimeOutMs,
                    memorylimit:
                        this.excutable.limit.compiler.memory +
                        getConfig().judger.mleMemOutByte,
                    pidlimit: getConfig().judger.defaultPidLimit,
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

    exec(stdio: StdioType, args: string[] = []): MeteredChildProcess {
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
                args,
                {
                    cwd: path.resolve(this.fileAgent.dir, this.cwdPrefix),
                    stdio,
                    uid: this.uid,
                    gid: this.gid,
                },
                {
                    timelimit:
                        this.excutable.limit.runtime.cpuTime +
                        getConfig().judger.tleTimeOutMs,
                    memorylimit:
                        this.excutable.limit.runtime.memory +
                        getConfig().judger.mleMemOutByte,
                    pidlimit: getConfig().judger.defaultPidLimit,
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
    protected logger = getLogger("JudgeAgent");
    constructor(
        public judge: CreateJudgeArgs,
        public timeRatio: number,
        public timeIntercept: number,
        readonly throttle: Throttle,
        protected uid: number,
        protected gid: number
    ) {
        this.excutables.push(judge.judge.user);
        this.fileAgent = new FileAgent(
            path.join("Heng-Client", judge.id),
            judge.data ?? null,
            this.uid,
            this.gid
        );
        if (judge.dynamicFiles !== undefined) {
            judge.dynamicFiles.forEach((file) => {
                if (file.type === "remote") {
                    this.fileAgent.add(file.name, file.file);
                }
            });
        }
    }

    getBasicCmp(usrLimit: Limit): ExecutableAgent {
        return new ExecutableAgent(
            {
                source: {
                    hashsum: "",
                    type: "direct",
                    content: "",
                },
                environment: {
                    language: "cmp", // const
                    system: "Linux",
                    arch: "x64",
                    options: {},
                },
                limit: usrLimit,
            },
            this.fileAgent,
            "cmp",
            "/",
            this.uid,
            this.gid
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
            "usr",
            this.uid,
            this.gid
        );
        const compileResult = await this.throttle.withThrottle(() =>
            userExecutableAgent.compile()
        );
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
        userResult: MeterResult,
        userExec: Executable,
        sysResult: MeterResult,
        sysExec: Executable,
        sysJudge: string
    ): JudgeCaseResult {
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
        throttle: Throttle,
        uid: number,
        gid: number,
        private cmp: string
    ) {
        super(judge, timeRatio, timeIntercept, throttle, uid, gid);
        if (judge.judge.type !== JudgeType.Normal) {
            throw `Wrong JudgeType ${judge.judge.type}(Should be ${JudgeType.Normal})`;
        }
    }

    async getResult(): Promise<JudgeResult> {
        const [compileResult, userExecutableAgent] = await this.compileUsr();
        const cmpExecutableAgent = this.getBasicCmp(
            this.judge.judge.user.limit
        );
        if (compileResult !== undefined) {
            return compileResult;
        } else if (userExecutableAgent !== undefined) {
            const result = this.judge.test?.cases?.map?.(async (value) => {
                const [inputFd, stdFd] = await Promise.all([
                    this.fileAgent.getFd(value.input),
                    this.fileAgent.getFd(value.output),
                ]);
                return this.throttle.withThrottle(async () => {
                    const userProcess = userExecutableAgent.exec([
                        inputFd,
                        // "pipe",
                        "pipe",
                        "pipe",
                    ]);
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
                    const compProcess = cmpExecutableAgent.exec([
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
        throttle: Throttle,
        uid: number,
        gid: number
    ) {
        super(judge, timeRatio, timeIntercept, throttle, uid, gid);
        if (judge.judge.type !== JudgeType.Special) {
            throw `Wrong JudgeType ${judge.judge.type}(Should be ${JudgeType.Special})`;
        }
    }
    async compileSpj(): Promise<
        [JudgeResult, undefined] | [undefined, ExecutableAgent]
    > {
        if (this.judge.judge.type != JudgeType.Special) {
            throw `Wrong JudgeType ${this.judge.judge.type}(Should be ${JudgeType.Special})`;
        }
        const userExecutableAgent = new ExecutableAgent(
            this.judge.judge.spj,
            this.fileAgent,
            "spj",
            "spj",
            this.uid,
            this.gid
        );
        const compileResult = await this.throttle.withThrottle(
            async () => await userExecutableAgent.compile(true)
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
                    const userProcess = userExecutableAgent.exec([
                        // "pipe",
                        inputFd,
                        "pipe",
                        "pipe",
                    ]);

                    const compProcess = spjExecutableAgent.exec([
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
        throttle: Throttle,
        uid: number,
        gid: number
    ) {
        super(judge, timeRatio, timeIntercept, throttle, uid, gid);
        if (judge.judge.type !== JudgeType.Interactive) {
            throw `Wrong JudgeType ${judge.judge.type}(Should be ${JudgeType.Interactive})`;
        }
    }
    async compileInteractor(): Promise<
        [JudgeResult, undefined] | [undefined, ExecutableAgent]
    > {
        if (this.judge.judge.type != JudgeType.Interactive) {
            throw `Wrong JudgeType ${this.judge.judge.type}(Should be ${JudgeType.Interactive})`;
        }
        const interactorExecutableAgent = new ExecutableAgent(
            this.judge.judge.interactor,
            this.fileAgent,
            "spj",
            "spj",
            this.uid,
            this.gid
        );
        const compileResult = await this.throttle.withThrottle(() =>
            interactorExecutableAgent.compile(true)
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
                    const userProcess = userExecutableAgent.exec([
                        "pipe",
                        "pipe",
                        "pipe",
                    ]);

                    const compProcess = interactorExecutableAgent.exec([
                        userProcess.stdout,
                        userProcess.stdin,
                        "pipe",
                        inputFd,
                        stdFd,
                        "pipe",
                    ]);
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
        readonly cmp: string,
        readonly throttle: Throttle,
        readonly uid: number,
        readonly gid: number
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
                    this.throttle,
                    this.uid,
                    this.gid,
                    this.cmp
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
                    this.throttle,
                    this.uid,
                    this.gid
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
                    this.throttle,
                    this.uid,
                    this.gid
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
    let judgerFactory = new JudgeFactory(
        1,
        0,
        judgerConfig.cmp,
        throttle,
        judgerConfig.uid,
        judgerConfig.gid
    );

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
    judgerFactory = new JudgeFactory(
        timeRatio,
        timeIntercept,
        judgerConfig.cmp,
        throttle,
        judgerConfig.uid,
        judgerConfig.gid
    );

    // 校验
    for (let round = 0; round < getConfig().judger.selfTestRound; round++) {
        await Promise.all(
            Tests.map(async (test) => {
                const judgeAgent = judgerFactory.getJudgerAgent(
                    JSON.parse(JSON.stringify(test.task))
                );
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
