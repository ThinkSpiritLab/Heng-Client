import { LanguageType } from "./LanguageType.enum";
import { BasicExcutable, BinExcutable, FilePath } from "./Excutable";

export type Compile = (
    src: FilePath,
    out: FilePath,
    cwd: FilePath
) => BinExcutable;

export type Interupt = (src: FilePath, param: BasicExcutable) => BinExcutable;

export class Language {
    static Languages = new Map<LanguageType, Language>();
}
