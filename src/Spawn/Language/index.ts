import { plainToClass } from "class-transformer";
import { getLogger } from "log4js";
import {
    BasicSpawnOption,
    jailMeterSpawn,
    JailSpawnOption,
    MeteredChildProcess,
} from "..";
import { config } from "../../Config";

export type CompileGenerator = (
    src: string, //path
    output: string, //path
    options: BasicSpawnOption,
    jailOption: JailSpawnOption
) => MeteredChildProcess; //compiler argv env

export type BasicCompileGenerator = (
    src: string, //path
    output: string //path
) => [string, string[]]; //compiler argv

export function generateCompileGenerator(
    basicCompileGenerator: BasicCompileGenerator
): CompileGenerator {
    return function (
        src: string, //path
        output: string, //path
        options: BasicSpawnOption,
        jailOption: JailSpawnOption
    ): MeteredChildProcess {
        const [compiler, argv] = basicCompileGenerator(src, output);
        return jailMeterSpawn(
            compiler,
            argv,
            options,
            jailOption
        );
    };
}

export const notCompile: CompileGenerator = generateCompileGenerator(
    (src, output) => ["dd", [`if=${src}`, `of=${output}`]]
);

export type BasicExcuteGenerator = (
    command: string,
    args: string[]
) => [command: string, args: string[], options: BasicSpawnOption];

export type ExcuteGenerator = (
    command: string,
    args: string[],
    options: BasicSpawnOption,
    jailOption: JailSpawnOption
) => MeteredChildProcess;

export function generateExcuterGenerator(
    basicExcuteGenerator: BasicExcuteGenerator
): ExcuteGenerator {
    return function (
        command: string,
        args: string[],
        options: BasicSpawnOption,
        jailOption: JailSpawnOption
    ): MeteredChildProcess {
        const [excuter, argv] = basicExcuteGenerator(command, args);
        return jailMeterSpawn(excuter, argv, options, jailOption);
    };
}

export class ConfiguredLanguage {
    constructor(
        readonly compileGenerator: CompileGenerator | null,
        readonly excuteGenerator: ExcuteGenerator | null,
        readonly sourceFileName: string,
        readonly compiledFileName: string
    ) {}
}

export type Language = (...args: string[]) => ConfiguredLanguage;

const logger = getLogger("LanguageService");

const languageMap = new Map<string, Language>();

class LanguageConfig {
    c?: string;
    cpp?: string;
    python?: string;
}

export const languageConfig = plainToClass(LanguageConfig, config.language);

export function registerLanguage(name: string, language: Language) {
    name = name.toLowerCase();
    if (!languageMap.has(name)) {
        languageMap.set(name, language);
        logger.info(`Language ${name} loaded`);
    } else {
        throw `Language ${name} exists`;
    }
}

export function getlanguage(name: string): Language {
    name = name.toLowerCase();
    const lan = languageMap.get(name);
    if (lan !== undefined) {
        return lan;
    } else {
        throw `Language ${name} not exists`;
    }
}
