import { getConfig } from "src/Config";
import {
    ConfiguredLanguage,
    generateCompileGenerator,
    Language,
    registerLanguage,
} from ".";

export const CPP: Language =  function (
    version: string,
    ...other: string[]
) {
    const extraOptions = new Set(other);
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
            return [cpp, compilerOptions];
        }),
        null,
        "src.cpp",
        "src.o"
    );
};
registerLanguage("cpp", CPP);
registerLanguage("cxx", CPP);
