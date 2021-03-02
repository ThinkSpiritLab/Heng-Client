import { getConfig } from "src/Config";
import {
    ConfiguredLanguage,
    generateExcuterGenerator,
    Language,
    registerLanguage,
} from ".";

export const PYTHON: Language = function () {
    const py = getConfig().language.python;
    return new ConfiguredLanguage(
        null,
        generateExcuterGenerator((command: string, args: string[]) => [
            py,
            [command, ...args],
            {},
        ]),
        "src.py",
        "src.py"
    );
};
registerLanguage("py", PYTHON);
registerLanguage("py3", PYTHON);
registerLanguage("python", PYTHON);
registerLanguage("python3", PYTHON);
