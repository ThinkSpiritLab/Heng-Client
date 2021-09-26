import { getConfig } from "../../Config";
import { RunOption, Language, LanguageConfigureOption, ExecType } from "./decl";

export class CMP extends Language {
    constructor(option: LanguageConfigureOption) {
        super(option);
        if (this.execType !== ExecType.System)
            throw new Error("Unrecognized language");
    }

    get compileCacheable(): boolean {
        return true;
    }

    get srcFileName(): string {
        return "src";
    }

    compileOptionGenerator(): RunOption {
        return { skip: true };
    }

    execOptionGenerator(): RunOption {
        const binPath = getConfig().language.ojcmp;
        return {
            skip: false,
            command: binPath,
            args: ["normal", "--user-fd", "0", "--std-fd", "3"],
            spawnOption: {
                cwd: "/",
            },
        };
    }
}
