import * as crypto from "crypto";
import { Executable } from "heng-protocol";
import path from "path";
import fs from "fs";
import { ExecType, Language } from "../Spawn/Language/decl";
import { FileAgent } from "./File";
import { getConfig } from "../Config";
import { CompleteStdioOptions } from "../Spawn/BasicSpawn";
import { getConfiguredLanguage } from "../Spawn/Language";
import { getLogger } from "log4js";
import { FileHandle } from "fs/promises";
import { hengSpawn, HengSpawnOption } from "../Spawn";
import { MeterResult } from "../Spawn/Meter";

const compileCachedJudge = new Map<string, string>();
export const SourceCodeName = "srcCode";
export const CompileLogName = "compile.log";
export const CompileStatisticName = "compile.statistic";

export class ExecutableAgent {
    private readonly judgeHash: string;
    private readonly dirHash: string;
    readonly fileAgent: FileAgent;
    private compiled = false; // whether compile in this instance
    private compileCacheable: boolean;
    private compileCached = false; // whether use cached dir
    readonly configuredLanguage: Language;
    private Initialized = 0;
    protected logger = getLogger("ExecutableAgent");

    constructor(
        public readonly execType: ExecType,
        public readonly executable: Executable
    ) {
        this.judgeHash = crypto
            .createHash("sha256")
            .update(
                JSON.stringify({
                    execType,
                    excutable: executable,
                })
            )
            .digest("hex");
        this.configuredLanguage = getConfiguredLanguage(
            this.executable.environment.language,
            {
                execType: this.execType,
                excutable: this.executable,
                compileDir: "",
            }
        );

        let dirHash_t: string | undefined = undefined;

        this.compileCacheable = this.configuredLanguage.compileCacheable;

        switch (execType) {
            case ExecType.Usr:
                this.compileCacheable =
                    this.compileCacheable && getConfig().judger.cacheUsr;
                break;
            case ExecType.Spj:
                this.compileCacheable =
                    this.compileCacheable && getConfig().judger.cacheSpj;
                break;
            case ExecType.Interactive:
                this.compileCacheable =
                    this.compileCacheable && getConfig().judger.cacheInteractor;
                break;
            default:
                break;
        }

        if (
            this.compileCacheable &&
            (dirHash_t = compileCachedJudge.get(this.judgeHash))
        ) {
            this.dirHash = dirHash_t;
            this.compileCached = true;
        } else {
            this.dirHash = crypto.randomBytes(32).toString("hex");
        }

        this.fileAgent = new FileAgent(
            path.join("bin", execType, this.dirHash),
            null
        );
        this.configuredLanguage.compileDir = this.fileAgent.dir;
    }

    /**
     * must use init() after constructor
     */
    async init(): Promise<void> {
        if (this.compileCached) {
            await this.fileAgent.init(true);
            this.fileAgent.register(
                SourceCodeName,
                this.configuredLanguage.srcFileName
            );
            // below files may not really exist if skip compile
            this.fileAgent.register(CompileLogName, CompileLogName);
            this.fileAgent.register(CompileStatisticName, CompileStatisticName);
        } else {
            await this.fileAgent.init(false);
            this.fileAgent.add(
                SourceCodeName,
                this.executable.source,
                this.configuredLanguage.srcFileName
            );
        }
        this.Initialized++;
    }

    private checkInit(): void {
        if (this.Initialized !== 1) {
            throw new Error("Don't forget to call init or init multiple times");
        }
    }

    private signCompileCache(): void {
        if (
            this.compileCacheable &&
            compileCachedJudge.get(this.judgeHash) === undefined
        ) {
            compileCachedJudge.set(this.judgeHash, this.dirHash);
            this.compileCached = true;
        }
    }

    private async spawn(
        languageOption: {
            args?: string[];
            command: string;
            spawnOption?: HengSpawnOption;
        },
        runOption: {
            args?: string[];
            cwd?: string;
            stdio?: CompleteStdioOptions;
        }
    ) {
        let logFileFH: FileHandle | undefined = undefined;
        try {
            if (!runOption.args) {
                runOption.args = [];
            }
            if (languageOption.args) {
                runOption.args = [...languageOption.args, ...runOption.args];
            }
            const logPath = path.resolve(this.fileAgent.dir, CompileLogName);
            logFileFH = await fs.promises.open(logPath, "w", 0o700);
            if (runOption.stdio === undefined) {
                runOption.stdio = ["ignore"];
            }
            runOption.stdio[1] = logFileFH.fd;
            runOption.stdio[2] = logFileFH.fd;
            const HengSpawnOption: HengSpawnOption = {
                cwd:
                    languageOption.spawnOption?.cwd ??
                    runOption.cwd ??
                    this.fileAgent.dir,
                env: languageOption.spawnOption?.env,
                stdio: runOption.stdio,
                uid: getConfig().judger.uid,
                gid: getConfig().judger.gid,
                timeLimit:
                    languageOption.spawnOption?.timeLimit ??
                    this.executable.limit.compiler.cpuTime,
                memoryLimit:
                    languageOption.spawnOption?.memoryLimit ??
                    this.executable.limit.compiler.memory,
                pidLimit:
                    languageOption.spawnOption?.pidLimit ??
                    getConfig().judger.defaultPidLimit,
                fileLimit:
                    languageOption.spawnOption?.fileLimit ??
                    this.executable.limit.compiler.output,
            };
            const subProc = hengSpawn(
                languageOption.command,
                runOption.args,
                HengSpawnOption
            );
            const procResult = await subProc.result;
            await logFileFH.close();
            this.fileAgent.register(CompileLogName, CompileLogName);
            try {
                for (const file of this.configuredLanguage.compiledFiles) {
                    await fs.promises.access(file);
                }
            } catch (error) {
                procResult.returnCode = procResult.returnCode || 1;
            }
            const statisticPath = path.resolve(
                this.fileAgent.dir,
                CompileStatisticName
            );
            await fs.promises.writeFile(
                statisticPath,
                JSON.stringify(procResult),
                { mode: 0o700 }
            );
            this.fileAgent.register(CompileStatisticName, CompileStatisticName);
            return procResult;
        } finally {
            logFileFH && (await logFileFH.close());
        }
    }

    /**
     * You'd better not set args, stdio, cwd.
     * cwd is low priority.
     * @param args
     * @param stdio
     * @param cwd
     * @returns
     */
    async compile(
        args?: string[],
        stdio?: CompleteStdioOptions,
        cwd?: string
    ): Promise<MeterResult | void> {
        this.checkInit();
        await this.fileAgent.getPath(SourceCodeName);
        const languageRunOption =
            this.configuredLanguage.compileOptionGenerator();
        if (languageRunOption.skip) {
            this.compiled = true;
            this.signCompileCache();
            return;
        }
        if (this.compiled || this.compileCached) {
            this.logger.info(
                `skip ${this.execType} compile, compiled: ${this.compiled}, compileCached：${this.compileCached}`
            );
            return JSON.parse(
                await this.fileAgent.getString(CompileStatisticName)
            );
        } else {
            const procResult = await this.spawn(languageRunOption, {
                args,
                cwd,
                stdio,
            });
            this.compiled = true;
            this.signCompileCache();
            return procResult;
        }
    }

    /**
     * You'd better set stdio.
     * You'd better not set cwd, args.
     * cwd is low priority.
     * @param args
     * @param stdio
     * @param cwd
     * @returns
     */
    async program(cwd?: string, stdio?: CompleteStdioOptions, args?: string[]) {
        this.checkInit();
        const languageRunOption =
            this.configuredLanguage.pragramOptionGenerator();
        if (languageRunOption.skip) {
            throw new Error("Can't skip pragram");
        }
        if (!this.compiled && !this.compileCached) {
            throw new Error("Please compile first");
        } else {
            const procResult = await this.spawn(languageRunOption, {
                args,
                cwd,
                stdio,
            });
            return procResult;
        }
    }

    /**
     * hey, clean me
     */
    async clean(): Promise<void> {
        if (
            this.dirHash &&
            this.judgeHash &&
            this.dirHash !== compileCachedJudge.get(this.judgeHash)
        ) {
            await this.fileAgent.clean();
        }
    }
}
