import { Language, languageConfig, registerLanguage } from ".";

export const CPP: Language = function (version: string, ...other: string[]) {
    if (languageConfig.cpp) {
        const extraOptions = new Set(other);
        return [
            function (
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
                return [languageConfig.cpp, compilerOptions, {}];
            },
            undefined,
        ];
    } else {
        throw "C++ compiler not configed";
    }
};
registerLanguage("cpp", CPP);
registerLanguage("cxx", CPP);
