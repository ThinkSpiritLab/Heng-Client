import { getConfig } from "../../Config";
import { ConfiguredLanguage, generateCompileGenerator, Language } from ".";

export const CPP: Language = function (args) {
    const cpp = getConfig().language.cpp;
    return new ConfiguredLanguage(
        generateCompileGenerator(function (
            src: string, //path
            output: string //path
        ) {
            const compilerOptions: string[] = [
                src,
                "-o",
                output,
                args.version !== undefined
                    ? `--std=${args.version}`
                    : "--std=c++17",
            ];
            if (args.o2 !== false) {
                compilerOptions.push("-O2");
            }
            if (args.static) {
                compilerOptions.push("-static");
            }
            if (args.lm) {
                compilerOptions.push("-lm");
            }
            return [cpp, compilerOptions];
        }),
        null,
        "src.cpp",
        "src.o"
    );
};
