import { Executable } from "heng-protocol";
import { JailSpawnOption } from "..";


export enum ExecType {
    System = "System",
    Usr = "Usr",
    Spj = "Spj",
    Interactor = "Interactor",
}

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
    workSpaceDir: string;
}

export abstract class Language {
    readonly execType: ExecType;
    readonly excutable: Executable;
    workSpaceDir: string;
    constructor(option: LanguageConfigureOption) {
        this.execType = option.execType;
        this.excutable = option.excutable;
        this.workSpaceDir = option.workSpaceDir;
    }
    abstract get compileCacheable(): boolean;
    abstract get srcFileName(): string;
    abstract compileOptionGenerator(): RunOption;
    abstract execOptionGenerator(): RunOption;
}


