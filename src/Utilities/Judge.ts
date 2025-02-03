import { randomBytes } from "crypto";
import { createReadStream } from "fs";
import { readFile, stat, writeFile } from "fs/promises";
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
import { range } from "lodash";
import { getLogger } from "log4js";
import { tmpdir } from "os";
import { join } from "path";
import { SerialPort } from "serialport";
import { getConfig } from "../Config";
import { Controller } from "../controller";
import { Tests } from "../SelfTest";
import { getLanguage } from "../Spawn/Language";
import { ExecType, RunType } from "../Spawn/Language/decl";
import { MeterResult } from "../Spawn/Meter";
import { ExecutableAgent, runLogName } from "./ExecutableAgent";
import { FileAgent, readStream } from "./File";
import { closePort } from "./Serial";
import { statistics } from "./Statistics";
import { Throttle } from "./Throttle";

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
        protected readonly compileThrottle: Throttle,
        protected readonly judgeThrottle: Throttle,
        protected readonly controller?: Controller
    ) {
        this.fileAgent = new FileAgent(
            join("workspace", judge.id),
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

    protected transformTime(rawTime: number): number {
        return Math.ceil(rawTime * this.timeRatio + this.timeIntercept);
    }

    protected async fillExtra(
        compileResult: MeterResult,
        executableAgent: ExecutableAgent,
        transformer: {
            mle: JudgeResultKind;
            tle: JudgeResultKind;
            ole: JudgeResultKind;
            ce: JudgeResultKind;
        }
    ): Promise<JudgeResult | undefined> {
        const compileSumTime = compileResult.time.sys + compileResult.time.usr;
        const compileLog = await executableAgent.fileAgent.getPath(runLogName);
        const compileLogSize = (await stat(compileLog)).size;
        const exteaInfo = {
            compileTime: this.transformTime(compileSumTime),
            compileMessage: await readStream(
                createReadStream(compileLog, {
                    encoding: "utf-8",
                    start: Math.max(
                        compileLogSize -
                            executableAgent.executable.limit.compiler.message,
                        compileLogSize - 10 * 1024,
                        0
                    ),
                    end: compileLogSize - 1,
                }),
                -1
            ),
        };
        if (executableAgent.execType === ExecType.Usr) {
            this.extra.user = exteaInfo;
        } else if (executableAgent.execType === ExecType.Spj) {
            this.extra.spj = exteaInfo;
        } else if (executableAgent.execType === ExecType.Interactive) {
            this.extra.interactor = exteaInfo;
        }
        let compileJudgeType: JudgeResultKind | undefined = undefined;
        if (compileResult.signal === 25) {
            compileJudgeType = transformer.ole;
        } else if (
            compileSumTime >
                executableAgent.executable.limit.compiler.cpuTime ||
            (compileResult.time.real >
                executableAgent.executable.limit.compiler.cpuTime &&
                compileResult.returnCode === -1 &&
                compileResult.signal === 9)
        ) {
            compileJudgeType = transformer.tle;
        } else if (
            compileResult.memory >=
            executableAgent.executable.limit.compiler.memory
        ) {
            compileJudgeType = transformer.mle;
        } else if (
            compileResult.signal !== -1 ||
            compileResult.returnCode !== 0
        ) {
            compileJudgeType = transformer.ce;
        }
        let runResult: JudgeResult | undefined = undefined;
        if (compileJudgeType !== undefined) {
            runResult = {
                cases: range(this.judge.test?.cases.length ?? 1).map(() => {
                    return {
                        kind: compileJudgeType,
                        time: 0,
                        memory: 0,
                    };
                }),
                extra: this.extra,
            };
        }
        return runResult;
    }

    protected async runJudge(
        executableAgent: ExecutableAgent,
        judgeFunction: (
            testCase: TestCase,
            judgeTimeout: number
        ) => Promise<JudgeCaseResult>
    ): Promise<JudgeCaseResult[]> {
        const programResult = await executableAgent.program();
        let runResult: JudgeResult | undefined = undefined;
        if (programResult !== undefined) {
            runResult = await this.fillExtra(programResult, executableAgent, {
                mle: JudgeResultKind.MemoryLimitExceeded,
                tle: JudgeResultKind.TimeLimitExceeded,
                ole: JudgeResultKind.OutpuLimitExceeded,
                ce: JudgeResultKind.RuntimeError,
            });
        }
        if (runResult !== undefined) {
            return runResult.cases;
        }
        const judgeCaseResults: JudgeCaseResult[] = [];
        if (this.judge.test) {
            for (const testCase of this.judge.test.cases) {
                const caseResult = await judgeFunction(
                    testCase,
                    executableAgent.executable.limit.runtime.cpuTime
                );
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
        const executableAgent = new ExecutableAgent(
            execType,
            executable,
            this.judge.dynamicFiles
        );
        this.ExecutableAgents.push(executableAgent);
        await executableAgent.init();
        await executableAgent.releaseFile();
        for (const type of Object.values(RunType)) {
            const rawResult = await this.compileThrottle.withThrottle(() =>
                executableAgent.run(type)
            );
            let filledResult: JudgeResult | undefined = undefined;
            if (rawResult) {
                filledResult = await this.fillExtra(
                    rawResult,
                    executableAgent,
                    transformer
                );
            }
            if (filledResult) {
                return [executableAgent, filledResult];
            }
        }
        return [executableAgent, undefined];
    }

    protected abstract getResult(): Promise<JudgeResult>;

    async getResultNoException(): Promise<JudgeResult> {
        // this.checkInit();
        try {
            statistics.tick(this.judge.id);
            await this.init();
            const ret = await this.getResult();
            await this.clean();
            statistics.finish(this.judge.id);
            return ret;
        } catch (err) {
            this.logger.fatal(err);
            await this.clean().catch((error) => {
                this.logger.fatal(error);
            });
            statistics.finish(this.judge.id);
            const e = {
                kind: JudgeResultKind.SystemError,
                time: 0,
                memory: 0,
                extraMessage: String(err),
            };
            return {
                cases: range(
                    Math.max(this.judge.test?.cases.length ?? 0, 1)
                ).map(() => e),
            };
        }
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
        protected readonly compileThrottle: Throttle,
        protected readonly judgeThrottle: Throttle,
        protected readonly controller?: Controller
    ) {
        super(
            judge,
            timeRatio,
            timeIntercept,
            compileThrottle,
            compileThrottle,
            controller
        );
    }

    protected async getResult(): Promise<JudgeResult> {
        this.checkInit();
        if (this.judge.judge.type !== JudgeType.Normal) {
            throw new Error(
                `Wrong JudgeType ${this.judge.judge.type}(Should be ${JudgeType.Normal})`
            );
        }

        void this.updateStatus(JudgeState.Preparing);
        statistics.tick(this.judge.id);

        const [userExecutableAgent, judgeResult] =
            await this.compileAndFillExtra(
                ExecType.Usr,
                this.judge.judge.user,
                UsrCompileResultTransformer
            );
        if (judgeResult !== undefined) {
            return judgeResult;
        }

        void this.updateStatus(JudgeState.Judging);
        statistics.tick(this.judge.id);

        const caseResults = await this.runJudge(
            userExecutableAgent,
            async (testCase, judgeTimeout) => {
                let kind = JudgeResultKind.SystemError;
                let time = 0;
                let memory = 0;
                const path = (await SerialPort.list()).find(
                    (info) =>
                        info.serialNumber &&
                        getConfig().fpga.serial.includes(info.serialNumber)
                )?.path;
                if (path) {
                    const [port, input, output] = await Promise.all([
                        SerialPort.binding.open({
                            baudRate: 4000,
                            path,
                        }),
                        this.fileAgent.getBuffer(testCase.input),
                        this.fileAgent.getBuffer(testCase.output),
                    ]);
                    const buffer = Buffer.alloc(output.length);
                    const start = Date.now();
                    await port.write(input);
                    const timeout = setTimeout(closePort, judgeTimeout, port);
                    try {
                        while (memory < output.length) {
                            const { bytesRead } = await port.read(
                                buffer,
                                memory,
                                output.length - memory
                            );
                            memory += bytesRead;
                        }
                        if (buffer.equals(output)) {
                            kind = JudgeResultKind.Accepted;
                        } else {
                            kind = JudgeResultKind.WrongAnswer;
                        }
                    } catch {
                        kind = JudgeResultKind.TimeLimitExceeded;
                    }
                    clearTimeout(timeout);
                    await closePort(port);
                    time = Date.now() - start;
                }
                return {
                    kind,
                    time,
                    memory,
                };
            }
        );

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
        protected readonly compileThrottle: Throttle,
        protected readonly controller?: Controller
    ) {
        super(
            judge,
            timeRatio,
            timeIntercept,
            compileThrottle,
            compileThrottle,
            controller
        );
    }

    protected async getResult(): Promise<JudgeResult> {
        this.checkInit();
        if (this.judge.judge.type !== JudgeType.Special) {
            throw new Error(
                `Wrong JudgeType ${this.judge.judge.type}(Should be ${JudgeType.Special})`
            );
        }

        void this.updateStatus(JudgeState.Preparing);
        statistics.tick(this.judge.id);

        const [userExecutableAgent, judgeResult1] =
            await this.compileAndFillExtra(
                ExecType.Usr,
                this.judge.judge.user,
                UsrCompileResultTransformer
            );
        if (judgeResult1 !== undefined) {
            return judgeResult1;
        }
        const [, judgeResult2] = await this.compileAndFillExtra(
            ExecType.Spj,
            this.judge.judge.spj,
            OtherCompileResultTransformer
        );
        if (judgeResult2 !== undefined) {
            return judgeResult2;
        }

        void this.updateStatus(JudgeState.Judging);
        statistics.tick(this.judge.id);

        const caseResults = await this.runJudge(
            userExecutableAgent,
            // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-unused-vars
            async (testCase) => {
                return {
                    kind: JudgeResultKind.OutpuLimitExceeded,
                    time: 0,
                    memory: 0,
                };
            }
        );

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
        protected readonly compileThrottle: Throttle,
        protected readonly controller?: Controller
    ) {
        super(
            judge,
            timeRatio,
            timeIntercept,
            compileThrottle,
            compileThrottle,
            controller
        );
    }

    protected async getResult(): Promise<JudgeResult> {
        this.checkInit();
        if (this.judge.judge.type !== JudgeType.Interactive) {
            throw new Error(
                `Wrong JudgeType ${this.judge.judge.type}(Should be ${JudgeType.Interactive})`
            );
        }

        void this.updateStatus(JudgeState.Preparing);
        statistics.tick(this.judge.id);

        const [userExecutableAgent, judgeResult1] =
            await this.compileAndFillExtra(
                ExecType.Usr,
                this.judge.judge.user,
                UsrCompileResultTransformer
            );
        if (judgeResult1 !== undefined) {
            return judgeResult1;
        }
        const [, judgeResult2] = await this.compileAndFillExtra(
            ExecType.Interactive,
            this.judge.judge.interactor,
            OtherCompileResultTransformer
        );
        if (judgeResult2 !== undefined) {
            return judgeResult2;
        }

        void this.updateStatus(JudgeState.Judging);
        statistics.tick(this.judge.id);

        const caseResults = await this.runJudge(
            userExecutableAgent,
            // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-unused-vars
            async (testCase) => {
                return {
                    kind: JudgeResultKind.OutpuLimitExceeded,
                    time: 0,
                    memory: 0,
                };
            }
        );

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
        readonly compileThrottle: Throttle,
        readonly judgeThrottle: Throttle,
        public controller?: Controller
    ) {}

    getJudgerAgent(judgeInfo: CreateJudgeArgs): JudgeAgent {
        judgeInfo.dynamicFiles = [
            {
                type: "builtin",
                name: getConfig().fpga.constraints,
            },
            {
                type: "builtin",
                name: getConfig().fpga.program,
            },
            ...getLanguage(
                judgeInfo.judge.user.environment.language
            ).modifyDynamicFile(judgeInfo.dynamicFiles),
        ];
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
                    this.compileThrottle,
                    this.judgeThrottle,
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
                    this.compileThrottle,
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
                    this.compileThrottle,
                    this.controller
                );
            }
            default:
                throw new Error("Unkown JudgeType");
        }
    }
}

export async function getJudgerFactory(
    compileThrottle: Throttle,
    judgeThrottle: Throttle
): Promise<JudgeFactory> {
    const logger = getLogger("JudgeFactoryFactory");
    logger.info("self test loaded");
    const timeIntercept = 0;
    let judgerFactory = new JudgeFactory(1, 0, compileThrottle, judgeThrottle);

    let costTime = 0,
        expectedTime = 0;

    logger.warn("start preheat");

    // 预热
    for (let round = 0; round < getConfig().judger.selfTestRound; round++) {
        await Promise.all(
            Tests.map(async (test) => {
                const _test = JSON.parse(
                    JSON.stringify(test.task)
                ) as CreateJudgeArgs;
                _test.id = randomBytes(32).toString("hex");
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
                const _test = JSON.parse(
                    JSON.stringify(test.task)
                ) as CreateJudgeArgs;
                _test.id = randomBytes(32).toString("hex");
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
    const lastTimeRatioFileName = join(tmpdir(), "Heng_Client.timeratio");
    try {
        const trStr = await readFile(lastTimeRatioFileName, {
            encoding: "utf-8",
        });
        const lastTimeRatio = parseFloat(trStr);
        timeRatio = lastTimeRatio;
        logger.info(
            `Succeed in loading last TimeRatio from ${lastTimeRatioFileName}`
        );
    } catch {
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

    judgerFactory = new JudgeFactory(
        timeRatio,
        timeIntercept,
        compileThrottle,
        judgeThrottle
    );

    logger.warn("start test system stability");

    // 校验
    for (let round = 0; round < getConfig().judger.selfTestRound; round++) {
        await Promise.all(
            Tests.map(async (test) => {
                const _test = JSON.parse(
                    JSON.stringify(test.task)
                ) as CreateJudgeArgs;
                _test.id = randomBytes(32).toString("hex");
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
        await writeFile(lastTimeRatioFileName, String(timeRatio), {
            mode: 0o700,
        });
        logger.info(`Succeed in writing TimeRatio to ${lastTimeRatioFileName}`);
    } catch {
        logger.warn(`Fail to write TimeRatio to ${lastTimeRatioFileName}`);
    }
    return judgerFactory;
}
