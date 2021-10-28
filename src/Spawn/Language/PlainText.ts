import path from "path";
import { getConfig } from "../../Config";
import { RunOption, Language, LanguageConfigureOption, ExecType } from "./decl";

export class PlainText extends Language {
    private src = "src.in";

    constructor(option: LanguageConfigureOption) {
        super(option);
        if (this.execType !== ExecType.Usr)
            throw new Error("Unrecognized language");
    }

    get compileCacheable(): boolean {
        return true;
    }

    get srcFileName(): string {
        return this.src;
    }

    compileOptionGenerator(): RunOption {
        return { skip: true };
    }

    get compiledFiles(): string[] {
        return [];
    }

    execOptionGenerator(): RunOption {
        const binPath = path.join(this.compileDir, this.src);
        return {
            skip: false,
            command: getConfig().language.cat,
            args: [binPath],
            jailSpawnOption: {
                bindMount: [
                    {
                        source: binPath,
                        mode: "ro",
                    },
                ],
            },
        };
    }
}
