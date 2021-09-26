import { Executable } from "heng-protocol";
import { JailSpawnOption } from "../Jail";

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

// Extract from BasicSpawnOption and JailSpawnOption and spawn's args
export type RunOption =
    | { skip: true }
    | {
          skip: false;
          command: string;
          args?: string[];
          spawnOption?: {
              cwd?: string;
              env?: { [key: string]: string };
          };
          jailSpawnOption?: JailSpawnOption;
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
    abstract compileOptionGenerator(): RunOption;
    abstract execOptionGenerator(): RunOption;
}
