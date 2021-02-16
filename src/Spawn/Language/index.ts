import { plainToClass } from "class-transformer";
import { getLogger } from "log4js";
import { config } from "../../Config";

export type compileGenerator = (
    src: string, //path
    output: string //path
) => [string, string[], { [key: string]: string }]; //compiler argv env

export const notCompile: compileGenerator = (src, output) => [
    "dd",
    [`if=${src}`, `of=${output}`],
    {},
];

export type excuteGenerator = undefined;

export type Language = (
    ...args: string[]
) => [compileGenerator, excuteGenerator];

const logger = getLogger("LanguageService");

const languageMap = new Map<string, Language>();

class LanguageConfig {
    c?: string;
    cpp?: string;
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
