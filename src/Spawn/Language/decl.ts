import { Executable } from "heng-protocol";
import { HengSpawnOption } from "..";

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
    compileDir: string;
}

export abstract class Language {
    readonly execType: ExecType;
    readonly excutable: Executable;
    compileDir: string;
    constructor(option: LanguageConfigureOption) {
        this.execType = option.execType;
        this.excutable = option.excutable;
        this.compileDir = option.compileDir;
    }
    abstract get compileCacheable(): boolean;
    abstract get srcFileName(): string;
    abstract get compiledFiles(): string[];
    abstract compileOptionGenerator(): RunOption;
    abstract execOptionGenerator(): RunOption;
}
