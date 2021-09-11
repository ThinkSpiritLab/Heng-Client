import { getLogger } from "log4js";
import { jailMeterSpawn, JailSpawnOption } from "..";

export type CompileGenerator = (
    src: string, //path
    output: string, //path
    options: BasicSpawnOption,
    jailOption: JailSpawnOption
) => JailedChildProcess; //compiler argv env

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
    ): JailedChildProcess {
        const [compiler, argv] = basicCompileGenerator(src, output);
        return jailMeterSpawn(compiler, argv, options, jailOption);
    };
}

/**
 * return value BasicSpawnOption is not used.
 */
export type BasicExcuteGenerator = (
    command: string,
    args: string[]
) => [string, string[], BasicSpawnOption];

export type ExcuteGenerator = (
    command: string,
    args: string[],
    options: BasicSpawnOption,
    jailOption: JailSpawnOption
) => JailedChildProcess;

export function generateExcuterGenerator(
    basicExcuteGenerator: BasicExcuteGenerator
): ExcuteGenerator {
    return function (
        command: string,
        args: string[],
        options: BasicSpawnOption,
        jailOption: JailSpawnOption
    ): JailedChildProcess {
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

export type Language = (
    args:
        | {
              [key: string]: string | boolean | number;
          }
        | undefined
) => ConfiguredLanguage;

const logger = getLogger("LanguageService");

const languageMap = new Map<string, Language>();

export function registerLanguage(name: string, language: Language): void {
    name = name.toLowerCase();
    if (!languageMap.has(name)) {
        languageMap.set(name, language);
        logger.info(`Language ${name} loaded`);
    } else {
        throw `Language ${name} exists`;
    }
}

export function getLanguage(name: string): Language {
    name = name.toLowerCase();
    const lan = languageMap.get(name);
    if (lan !== undefined) {
        return lan;
    } else {
        throw `Language ${name} not exists`;
    }
}

import { CPP } from "./CPP";
registerLanguage("cpp", CPP);
registerLanguage("cxx", CPP);
registerLanguage("c++", CPP);
import { C } from "./C";
registerLanguage("c", C);
import { PYTHON } from "./Python";
registerLanguage("py", PYTHON);
registerLanguage("py3", PYTHON);
registerLanguage("python", PYTHON);
registerLanguage("python3", PYTHON);
import { JAVA } from "./Java";
registerLanguage("java", JAVA);
import { CMP } from "./CMP";
import { JailedChildProcess } from "../Jail";
import { BasicSpawnOption } from "../BasicSpawn";
registerLanguage("cmp", CMP);
export { CPP, C, PYTHON, JAVA, CMP };
