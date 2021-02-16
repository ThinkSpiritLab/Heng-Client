import {
    ConfiguredLanguage,
    Language,
    languageConfig,
    registerLanguage,
    generateCompileGenerator,
} from ".";

export const C: Language = function (version: string, ...other: string[]) {
    if (languageConfig.c) {
        const extraOptions = new Set(other);
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
                return [languageConfig.c, compilerOptions];
            }),
            null,
            "src.c",
            "src.o"
        );
    } else {
        throw "C compiler not configed";
    }
};
registerLanguage("c", C);
