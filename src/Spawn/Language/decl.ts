import { Executable } from "heng-protocol";
import { HengSpawnOption } from "..";

export enum RunType {
    Synthesis = "synthesis",
    Translate = "translate",
    Map = "map",
    Implement = "implement",
    Generate = "generate",
}

export enum ExecType {
    System = "system",
    Usr = "usr",
    Spj = "spj",
    Interactive = "interactive",
}

export const ExecTypeArray = [
    ExecType.System,
    ExecType.Usr,
    ExecType.Spj,
    ExecType.Interactive,
];

// Extract from HengSpawnOption
export type RunOption =
    | { skip: true }
    | {
          skip: false;
          command: string;
          args?: string[];
          spawnOption?: HengSpawnOption;
      };

export interface LanguageConfigureOption {
    execType: ExecType;
    excutable: Executable;
    runDir: string;
}

export interface compileOption {
    get cacheable(): boolean;
    get outputFiles(): string[];
    optionGenerator(): RunOption;
}

export abstract class Language {
    readonly execType: ExecType;
    readonly excutable: Executable;
    runDir: string;
    constructor(option: LanguageConfigureOption) {
        this.execType = option.execType;
        this.excutable = option.excutable;
        this.runDir = option.runDir;
    }
    abstract get compileCacheable(): boolean;
    abstract get compiledFiles(): string[];
    abstract get judgeTimeout(): number;
    abstract compileOptionGenerator(): RunOption;
    abstract get srcFileName(): string;
    abstract [RunType.Synthesis]: compileOption;
    abstract [RunType.Translate]: compileOption;
    abstract [RunType.Map]: compileOption;
    abstract [RunType.Implement]: compileOption;
    abstract [RunType.Generate]: compileOption;
    abstract pragramOptionGenerator(): RunOption;
}
