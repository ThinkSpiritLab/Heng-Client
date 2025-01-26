import * as crypto from "crypto";
import { DynamicFile, Executable } from "heng-protocol";
import path from "path";
import fs from "fs";
import { ExecType, Language, RunType } from "../Spawn/Language/decl";
import { FileAgent } from "./File";
import { getBuiltin, getConfig } from "../Config";
import { CompleteStdioOptions } from "../Spawn/BasicSpawn";
import { getConfiguredLanguage } from "../Spawn/Language";
import { getLogger } from "log4js";
import { FileHandle } from "fs/promises";
import { hengSpawn, HengSpawnOption } from "../Spawn";
import { MeterResult } from "../Spawn/Meter";

export const SourceCodeName = "srcCode";
export const runLogName = "run.log";

const runCachedJudge: Record<RunType, Map<string, string>> = {
    [RunType.Synthesis]: new Map<string, string>(),
    [RunType.Translate]: new Map<string, string>(),
    [RunType.Map]: new Map<string, string>(),
    [RunType.Implement]: new Map<string, string>(),
    [RunType.Generate]: new Map<string, string>(),
};
export const runStatisticsName: Readonly<Record<RunType, string>> = {
    [RunType.Synthesis]: "synthesis.statistic",
    [RunType.Translate]: "translate.statistic",
    [RunType.Map]: "map.statistic",
    [RunType.Implement]: "implement.statistic",
    [RunType.Generate]: "generate.statistic",
};

export class ExecutableAgent {
    private readonly judgeHash: string;
    private readonly dirHash: string;
    readonly fileAgent: FileAgent;
    private ran: Record<RunType, boolean> = {
        [RunType.Synthesis]: false,
        [RunType.Translate]: false,
        [RunType.Map]: false,
        [RunType.Implement]: false,
        [RunType.Generate]: false,
    }; // whether compile in this instance
    private runCacheable: Record<RunType, boolean> = {
        [RunType.Synthesis]: false,
        [RunType.Translate]: false,
        [RunType.Map]: false,
        [RunType.Implement]: false,
        [RunType.Generate]: false,
    };
    private runCached: Record<RunType, boolean> = {
        [RunType.Synthesis]: false,
        [RunType.Translate]: false,
        [RunType.Map]: false,
        [RunType.Implement]: false,
        [RunType.Generate]: false,
    }; // whether use cached dir
    readonly configuredLanguage: Language;
    private Initialized = 0;
    protected logger = getLogger("ExecutableAgent");

    constructor(
        readonly execType: ExecType,
        readonly executable: Executable,
        readonly dynamicFiles: DynamicFile[] = []
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
                runDir: "",
            }
        );

        let dirHash_t: string | undefined = undefined;

        for (const runType of Object.values(RunType)) {
            this.runCacheable[runType] =
                this.configuredLanguage[runType].cacheable &&
                ((execType == ExecType.Usr && getConfig().judger.cacheUsr) ||
                    (execType == ExecType.Spj && getConfig().judger.cacheSpj) ||
                    (execType == ExecType.Interactive &&
                        getConfig().judger.cacheInteractor));
            if (this.runCacheable[runType]) {
                const dirHash = runCachedJudge[runType].get(this.judgeHash);
                if (dirHash) {
                    dirHash_t = dirHash;
                    this.runCached[runType] = true;
                }
            }
        }

        if (dirHash_t) {
            this.dirHash = dirHash_t;
        } else {
            this.dirHash = crypto.randomBytes(32).toString("hex");
        }

        this.fileAgent = new FileAgent(
            path.join("bin", execType, this.dirHash),
            null
        );
        this.configuredLanguage.runDir = this.fileAgent.dir;
    }

    /**
     * must use init() after constructor
     */
    async init(): Promise<void> {
        if (this.runCached[RunType.Synthesis]) {
            await this.fileAgent.init(true);
            this.fileAgent.register(
                SourceCodeName,
                this.configuredLanguage.srcFileName
            );
            for (const { name } of this.dynamicFiles) {
                this.fileAgent.register(name, name);
            }
            // below files may not really exist if skip compile
            this.fileAgent.register(runLogName, runLogName);
            for (const name of Object.values(runStatisticsName)) {
                this.fileAgent.register(name, name);
            }
        } else {
            await this.fileAgent.init(false);
            this.fileAgent.add(
                SourceCodeName,
                this.executable.source,
                this.configuredLanguage.srcFileName
            );
            for (const dynamicFiles of this.dynamicFiles) {
                switch (dynamicFiles.type) {
                    case "builtin":
                        this.fileAgent.add(dynamicFiles.name, {
                            content: getBuiltin().get(dynamicFiles.name),
                        });
                        break;
                    case "remote":
                        this.fileAgent.add(
                            dynamicFiles.name,
                            dynamicFiles.file
                        );
                        break;
                    default:
                        throw new Error("Unknown dynamic file type");
                }
            }
        }
        this.Initialized++;
    }

    private checkInit(): void {
        if (this.Initialized !== 1) {
            throw new Error("Don't forget to call init or init multiple times");
        }
    }

    async releaseFile() {
        this.checkInit();
        await Promise.all([
            this.fileAgent.getPath(SourceCodeName),
            ...this.dynamicFiles.map((dynamicFile) =>
                this.fileAgent.getPath(dynamicFile.name)
            ),
        ]);
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
        },
        runType?: RunType
    ) {
        let runLogFileFH: FileHandle | undefined = undefined;
        try {
            if (!runOption.args) {
                runOption.args = [];
            }
            if (languageOption.args) {
                runOption.args = [...languageOption.args, ...runOption.args];
            }
            const runLogPath = path.resolve(this.fileAgent.dir, runLogName);
            runLogFileFH = await fs.promises.open(runLogPath, "w", 0o700);
            if (runOption.stdio === undefined) {
                runOption.stdio = ["ignore"];
            }
            runOption.stdio[1] = runLogFileFH.fd;
            runOption.stdio[2] = runLogFileFH.fd;
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
            await runLogFileFH.close();
            this.fileAgent.register(runLogName, runLogName);
            if (runType) {
                try {
                    for (const file of this.configuredLanguage[runType]
                        .outputFiles) {
                        await fs.promises.access(file);
                    }
                } catch (error) {
                    procResult.returnCode = procResult.returnCode || 1;
                }
                await fs.promises.writeFile(
                    path.resolve(
                        this.fileAgent.dir,
                        runStatisticsName[runType]
                    ),
                    JSON.stringify(procResult),
                    { mode: 0o700 }
                );
                this.fileAgent.register(
                    runStatisticsName[runType],
                    runStatisticsName[runType]
                );
            }
            return procResult;
        } finally {
            runLogFileFH && (await runLogFileFH.close());
        }
    }

    private signRunCache(type: RunType): void {
        if (
            this.runCacheable[type] &&
            runCachedJudge[type].get(this.judgeHash) === undefined
        ) {
            runCachedJudge[type].set(this.judgeHash, this.dirHash);
            this.runCached[type] = true;
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
    async run(
        type: RunType,
        args?: string[],
        cwd?: string,
        stdio?: CompleteStdioOptions
    ): Promise<MeterResult | void> {
        this.checkInit();
        const languageRunOption =
            this.configuredLanguage[type].optionGenerator();
        if (languageRunOption.skip) {
            this.ran[type] = true;
            this.signRunCache(type);
            return;
        }
        if (this.ran[type] || this.runCached[type]) {
            this.logger.info(
                `skip ${this.execType} run, ran: ${this.ran[type]}, ${type}Cached：${this.runCached[type]}`
            );
            return JSON.parse(
                await this.fileAgent.getString(runStatisticsName[type])
            );
        }
        const procResult = await this.spawn(languageRunOption, {
            args,
            cwd,
            stdio,
        });
        this.ran[type] = true;
        this.signRunCache(type);
        return procResult;
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
    async program(args?: string[], cwd?: string, stdio?: CompleteStdioOptions) {
        this.checkInit();
        const languageRunOption =
            this.configuredLanguage.pragramOptionGenerator();
        if (languageRunOption.skip) {
            throw new Error("Can't skip pragram");
        }
        if (!this.ran[RunType.Generate] && !this.runCached[RunType.Generate]) {
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
        if (this.dirHash && this.judgeHash) {
            for (const runType of Object.values(RunType)) {
                if (
                    this.dirHash == runCachedJudge[runType].get(this.judgeHash)
                ) {
                    return;
                }
            }
        }
        await this.fileAgent.clean();
    }
}
