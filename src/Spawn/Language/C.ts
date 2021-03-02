import { getConfig } from "src/Config";
import {
    ConfiguredLanguage,
    Language,
    registerLanguage,
    generateCompileGenerator,
} from ".";

export const C: Language = function (version: string, ...other: string[]) {
    const extraOptions = new Set(other);
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
                `--std=${version}`,
            ];
            if (extraOptions.has("O2")) {
                compilerOptions.push("-O2");
            }
            if (extraOptions.has("static")) {
                compilerOptions.push("-static");
            }
            if (extraOptions.has("lm")) {
                compilerOptions.push("-lm");
            }
            return [c, compilerOptions];
        }),
        null,
        "src.c",
        "src.o"
    );
};
registerLanguage("c", C);
