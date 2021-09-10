import { getConfig } from "../../Config";
import { ConfiguredLanguage, generateExcuterGenerator, Language } from ".";

export const CMP: Language = function () {
    const cmp = getConfig().judger.cmp;
    return new ConfiguredLanguage(
        null,
        generateExcuterGenerator(() =>
            // command: string, args: string[]
            [cmp, ["normal", "--user-fd", "0", "--std-fd", "3"], {}]
        ),
        "cmp",
        cmp
    );
};
