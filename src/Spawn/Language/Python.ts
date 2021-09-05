import { getConfig } from "../../Config";
import {
    ConfiguredLanguage,
    generateExcuterGenerator,
    Language,
} from ".";

export const PYTHON: Language = function () {
    const py = getConfig().language.python;
    return new ConfiguredLanguage(
        null,
        generateExcuterGenerator((command: string, args: string[]) => [
            py,
            [command, ...args],
            {}, // not used, ignore it
        ]),
        "src.py",
        "src.py"
    );
};

