import {
    ConfiguredLanguage,
    generateExcuterGenerator,
    Language,
    languageConfig,
    registerLanguage,
} from ".";

export const PYTHON: Language = function () {
    if (languageConfig.python) {
        return new ConfiguredLanguage(
            null,
            generateExcuterGenerator((command: string, args: string[]) => [
                languageConfig.python,
                [command, ...args],
                {},
            ]),
            "src.py",
            "src.py"
        );
    } else {
        throw "Pyhon excuter not configed";
    }
};
registerLanguage("py", PYTHON);
registerLanguage("py3", PYTHON);
registerLanguage("python", PYTHON);
registerLanguage("python3", PYTHON);
