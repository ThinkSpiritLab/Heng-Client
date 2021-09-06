import { getConfig } from "../../Config";
import { ConfiguredLanguage, Language, generateCompileGenerator } from ".";

export const C: Language = function (args) {
    const c = getConfig().language.c;
    return new ConfiguredLanguage(
        generateCompileGenerator(function (
            src: string,
            output: string //path
        ) {
            const compilerOptions: string[] = [
                src,
                "-o",
                output,
                args?.version !== undefined
                    ? `--std=${args.version}`
                    : "--std=c99",
            ];
            if (args?.o2 !== false) {
                compilerOptions.push("-O2");
            }
            if (args?.static) {
                compilerOptions.push("-static");
            }
            if (args?.lm) {
                compilerOptions.push("-lm");
            }
            return [c, compilerOptions];
        }),
        null,
        "src.c",
        "src"
    );
};
