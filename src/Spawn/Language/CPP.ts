import {
    ConfiguredLanguage,
    generateCompileGenerator,
    Language,
    languageConfig,
    registerLanguage,
} from ".";

export const CPP: Language = function (version: string, ...other: string[]) {
    if (languageConfig.cpp) {
        const extraOptions = new Set(other);
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
                return [languageConfig.cpp, compilerOptions];
            }),
            null,
            "src.cpp",
            "src.o"
        );
    } else {
        throw "C++ compiler not configed";
    }
};
registerLanguage("cpp", CPP);
registerLanguage("cxx", CPP);
