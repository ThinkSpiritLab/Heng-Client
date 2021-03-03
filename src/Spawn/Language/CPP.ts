import { getConfig } from "src/Config";
import {
    ConfiguredLanguage,
    generateCompileGenerator,
    Language,
    registerLanguage,
} from ".";

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
                    : "--std=C++17",
            ];
            if (args.o2) {
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
registerLanguage("cpp", CPP);
registerLanguage("cxx", CPP);
