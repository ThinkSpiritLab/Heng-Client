import * as crypto from "crypto";
import { Executable } from "heng-protocol";
import path from "path";
import fs from "fs";
import { ExecType, Language } from "../Spawn/LanguageV2/decl";
import { FileAgent, readStream, waitForOpen } from "./File";
import {
    JailBindMountOption,
    JailedChildProcess,
    JailResult,
    jailSpawn,
    JailSpawnOption,
} from "../Spawn/Jail";
import { getConfig } from "../Config";
import { BasicSpawnOption, CompleteStdioOptions } from "../Spawn/BasicSpawn";
import { getConfiguredLanguage } from "../Spawn/LanguageV2";
import { getLogger } from "log4js";

const compileCachedJudge = new Set<string>();
export const SourceCodeName = "srcCode";
export const CompileLogName = "compile.log";
export const CompileStatisticName = "compile.statistic";

export class ExecutableAgent {
    private readonly judgeHash: string;
    readonly fileAgent: FileAgent;
    private compiled = false;
    private compileCached = false;
    readonly configuredLanguage: Language;
    private Initialized = false;
    protected logger = getLogger("ExecutableAgent");

    constructor(
        private readonly execType: ExecType,
        private readonly excutable: Executable
    ) {
        this.judgeHash = crypto
            .createHash("sha256")
            .update(
                JSON.stringify({
                    execType,
                    excutable,
                })
            )
            .digest("hex");
        this.fileAgent = new FileAgent(
            path.join(getConfig().judger.tmpdirBase, "bin", this.judgeHash),
            null
        );
        this.configuredLanguage = getConfiguredLanguage(
            this.excutable.environment.language,
            {
                execType: this.execType,
                excutable: this.excutable,
                workSpaceDir: this.fileAgent.dir,
            }
        );
        if (
            this.configuredLanguage.compileCacheable &&
            compileCachedJudge.has(this.judgeHash)
        ) {
            this.compileCached = true;
            this.compiled = true;
        }
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
            if (!this.configuredLanguage.compileOptionGenerator().skip) {
                this.fileAgent.register(CompileLogName, CompileLogName);
                this.fileAgent.register(
                    CompileStatisticName,
                    CompileStatisticName
                );
            }
        } else {
            await this.fileAgent.init();
            this.fileAgent.add(
                SourceCodeName,
                this.excutable.source,
                this.configuredLanguage.srcFileName
            );
        }
        this.Initialized = true;
        return;
    }

    checkInit(): void {
        if (!this.Initialized) {
            throw new Error("Don't forget to call init");
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
    ): Promise<JailResult | void> {
        this.checkInit();
        await this.fileAgent.getPath(SourceCodeName);
        const languageRunOption =
            this.configuredLanguage.compileOptionGenerator();
        if (languageRunOption.skip) {
            this.compiled = true;
            return;
        }
        if (this.compiled || this.compileCached) {
            this.logger.info(
                `skip compile, compiled: ${this.compiled}, compileCached：${this.compileCached}`
            );
            return JSON.parse(
                await readStream(
                    await this.fileAgent.getStream(CompileStatisticName)
                )
            );
        } else {
            const command = languageRunOption.command;
            if (!args) {
                args = [];
            }
            if (languageRunOption.args) {
                args = [...args, ...languageRunOption.args];
            }
            const compileLogPath = path.resolve(
                this.fileAgent.dir,
                CompileLogName
            );
            const compileLogFileStream = fs.createWriteStream(compileLogPath);
            await waitForOpen(compileLogFileStream);
            if (stdio === undefined) {
                stdio = ["pipe", "pipe", "pipe"];
            }
            stdio[1] = compileLogFileStream;
            stdio[2] = compileLogFileStream;
            const spawnOption: BasicSpawnOption = {
                cwd:
                    languageRunOption.spawnOption?.cwd ??
                    cwd ??
                    this.fileAgent.dir,
                env: languageRunOption.spawnOption?.env,
                stdio: stdio,
                uid: getConfig().judger.uid,
                gid: getConfig().judger.gid,
            };
            let bindMount: JailBindMountOption[] = [
                {
                    source: this.fileAgent.dir,
                    mode: "rw",
                },
            ];
            if (languageRunOption.jailSpawnOption?.bindMount) {
                bindMount = [
                    ...bindMount,
                    ...languageRunOption.jailSpawnOption.bindMount,
                ];
            }

            const jailSpawnOption: JailSpawnOption = {
                timelimit:
                    languageRunOption.jailSpawnOption?.timelimit ??
                    this.excutable.limit.compiler.cpuTime,
                memorylimit:
                    languageRunOption.jailSpawnOption?.memorylimit ??
                    this.excutable.limit.compiler.memory,
                pidlimit:
                    languageRunOption.jailSpawnOption?.pidlimit ??
                    getConfig().judger.defaultPidLimit,
                filelimit:
                    languageRunOption.jailSpawnOption?.filelimit ??
                    this.excutable.limit.compiler.output,
                tmpfsMount: languageRunOption.jailSpawnOption?.tmpfsMount,
                bindMount,
            };

            const subProc = jailSpawn(
                command,
                args,
                spawnOption,
                jailSpawnOption
            );
            const jailResult = await subProc.result;

            this.fileAgent.register(CompileLogName, CompileLogName);
            const compileStatisticPath = path.resolve(
                this.fileAgent.dir,
                CompileStatisticName
            );
            await fs.promises.writeFile(
                compileStatisticPath,
                JSON.stringify(jailResult)
            );
            this.fileAgent.register(CompileStatisticName, CompileStatisticName);
            this.compiled = true;
            compileCachedJudge.add(this.judgeHash);
            if (this.configuredLanguage.compileCacheable) {
                this.compileCached = true;
            }
            return jailResult;
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
    async exec(
        cwd?: string,
        stdio?: CompleteStdioOptions,
        args?: string[]
    ): Promise<JailedChildProcess> {
        this.checkInit();
        const languageRunOption = this.configuredLanguage.execOptionGenerator();
        if (languageRunOption.skip) {
            throw new Error("Can't skip exec");
        }
        if (!this.compiled) {
            throw new Error("Please compile first");
        } else {
            const command = languageRunOption.command;
            if (!args) {
                args = [];
            }
            if (languageRunOption.args) {
                args = [...args, ...languageRunOption.args];
            }

            const spawnOption: BasicSpawnOption = {
                cwd:
                    languageRunOption.spawnOption?.cwd ??
                    cwd ??
                    this.fileAgent.dir,
                env: languageRunOption.spawnOption?.env,
                stdio: stdio,
                uid: getConfig().judger.uid,
                gid: getConfig().judger.gid,
            };
            let bindMount: JailBindMountOption[] = [];
            if (languageRunOption.jailSpawnOption?.bindMount) {
                bindMount = [
                    ...bindMount,
                    ...languageRunOption.jailSpawnOption.bindMount,
                ];
            }
            const jailSpawnOption: JailSpawnOption = {
                timelimit:
                    languageRunOption.jailSpawnOption?.timelimit ??
                    this.excutable.limit.runtime.cpuTime,
                memorylimit:
                    languageRunOption.jailSpawnOption?.memorylimit ??
                    this.excutable.limit.runtime.memory,
                pidlimit:
                    languageRunOption.jailSpawnOption?.pidlimit ??
                    getConfig().judger.defaultPidLimit,
                filelimit:
                    languageRunOption.jailSpawnOption?.filelimit ??
                    this.excutable.limit.runtime.output,
                tmpfsMount: languageRunOption.jailSpawnOption?.tmpfsMount,
                bindMount,
            };

            const subProc = jailSpawn(
                command,
                args,
                spawnOption,
                jailSpawnOption
            );
            return subProc;
        }
    }

    /**
     * hey, clean me
     */
    async clean(): Promise<void> {
        if (!this.compileCached) {
            await this.fileAgent.clean();
        }
    }
}