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
import { ConfiguredLanguage, getLanguage } from "../Spawn/Language";
import { FileAgent, readStream, waitForOpen } from "./File";
import { jailMeterSpawn } from "../Spawn";
import { MeteredChildProcess, MeterResult } from "../Spawn/Meter";
import { StdioType } from "src/Spawn/BasicSpawn";
import { Throttle } from "./Throttle";

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
                    uid: this.uid,
                    gid: this.gid,
                },
                {
                    timelimit: this.excutable.limit.compiler.cpuTime,
                    memorylimit: this.excutable.limit.compiler.memory,
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
                    timelimit: this.excutable.limit.runtime.cpuTime,
                    memorylimit: this.excutable.limit.runtime.memory,
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
            // TODO why usr
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

    // async getBasicCmp(): Promise<ExecutableAgent> {
    //     return new ExecutableAgent(
    //         {},
    //         this.fileAgent,
    //         "",
    //         "cmp",
    //         this.uid,
    //         this.gid
    //     );
    // }

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
                        extraMessage: e.toString(),
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
                    sysResult.returnCode !== 0
                ) {
                    return JudgeResultKind.SystemRuntimeError;
                } else if (sysJudge === "AC") {
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
            time: userResult.time.usr * this.timeRatio + this.timeIntercept,
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
        if (compileResult !== undefined) {
            return compileResult;
        } else if (userExecutableAgent !== undefined) {
            const result = this.judge.test?.cases?.map?.(async (value) => {
                const [inputStream, stdPath] = await Promise.all([
                    this.fileAgent.getStream(value.input),
                    this.fileAgent.getPath(value.output),
                ]);
                return this.throttle.withThrottle(async () => {
                    const userProcess = userExecutableAgent.exec([
                        // inputStream,
                        "pipe",
                        "pipe",
                        "pipe",
                    ]);
                    if (userProcess.stdin) {
                        inputStream.pipe(userProcess.stdin);
                    }
                    const compProcess = jailMeterSpawn(
                        this.cmp,
                        ["normal", "--user-fd", "0", "--std", stdPath],
                        { stdio: [userProcess.stdout, "pipe", "pipe"] },
                        {
                            timelimit: this.judge.judge.user.limit.runtime
                                .cpuTime,
                            memorylimit: this.judge.judge.user.limit.runtime
                                .memory,
                            pidlimit: getConfig().judger.defaultPidLimit,
                            filelimit: this.judge.judge.user.limit.runtime
                                .output,
                            mount: [{ path: stdPath, mode: "ro" }],
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
                        cases:
                            this.judge.test?.cases.map(() => ({
                                kind: JudgeResultKind.SystemCompileError,
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
                                kind: JudgeResultKind.SystemCompileError,
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
                                kind: JudgeResultKind.SystemCompileError,
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
                                kind: JudgeResultKind.SystemCompileError,
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
                const [
                    inputStream,
                    inputStream2,
                    stdStream,
                ] = await Promise.all([
                    this.fileAgent.getFd(value.input),
                    this.fileAgent.getFd(value.input),
                    this.fileAgent.getFd(value.output),
                ]);
                return this.throttle.withThrottle(async () => {
                    const userProcess = userExecutableAgent.exec([
                        // "pipe",
                        inputStream,
                        "pipe",
                        "pipe",
                    ]);

                    const compProcess = spjExecutableAgent.exec([
                        userProcess.stdout,
                        "pipe",
                        "pipe",
                        inputStream2,
                        stdStream,
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
                        cases:
                            this.judge.test?.cases.map(() => ({
                                kind: JudgeResultKind.SystemCompileError,
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
                                kind: JudgeResultKind.SystemCompileError,
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
                                kind: JudgeResultKind.SystemCompileError,
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
                                kind: JudgeResultKind.SystemCompileError,
                                time: 0,
                                memory: 0,
                            })) ?? [],
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
        const [
            spjCompileResult,
            interactorExecutableAgent,
        ] = await this.compileInteractor();
        if (compileResult !== undefined) {
            return compileResult;
        } else if (spjCompileResult !== undefined) {
            return spjCompileResult;
        } else if (
            userExecutableAgent !== undefined &&
            interactorExecutableAgent !== undefined
        ) {
            const result = this.judge.test?.cases?.map?.(async (value) => {
                const [inputStream, stdStream] = await Promise.all([
                    this.fileAgent.getFd(value.input),
                    this.fileAgent.getFd(value.output),
                ]);
                return this.throttle.withThrottle(async () => {
                    const userProcess = userExecutableAgent.exec([
                        inputStream,
                        "pipe",
                        "pipe",
                    ]);

                    const compProcess = interactorExecutableAgent.exec([
                        userProcess.stdout,
                        "pipe",
                        "pipe",
                        inputStream,
                        stdStream,
                        userProcess.stdin,
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
    const result = (
        await Promise.all(
            judgerConfig.testcases.map(async (testcase, index) => {
                logger.info(`self test ${index} loaded`);
                const fileAgent = new FileAgent(
                    `${process.pid}selfTest${index}`,
                    null,
                    // TODO root?
                    process.getuid(),
                    process.getgid()
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
                                timelimit: 10000,
                                memorylimit: 512 * 1024 * 1024,
                                pidlimit: getConfig().judger.defaultPidLimit,
                                filelimit: 1024 * 1024 * 1024,
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
                            memorylimit: 512 * 1024 * 1024,
                            pidlimit: getConfig().judger.defaultPidLimit,
                            filelimit: 1024 * 1024 * 1024,
                            mount: [{ path: curExcutablePath, mode: "ro" }],
                        }
                    );
                    // TODO understand it
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
                    return [testcase.timeExpected, testResult.time.real];
                } finally {
                    // await fileAgent.clean();
                }
            })
        )
    ).reduce((lop, rop) => [lop[0] + rop[0], lop[1] + rop[1]]);
    const timeRatio = result[0] / result[1];
    logger.info(`timeRatio is ${timeRatio}`);
    return new JudgeFactory(
        timeRatio,
        timeIntercept,
        judgerConfig.cmp,
        throttle,
        judgerConfig.uid,
        judgerConfig.gid
    );
}
