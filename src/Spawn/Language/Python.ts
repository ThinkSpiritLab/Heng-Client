import path from "path";
import { getConfig } from "../../Config";
import { RunOption, Language, LanguageConfigureOption } from "./decl";

export class Python extends Language {
    private src = "src.py";

    constructor(option: LanguageConfigureOption) {
        super(option);
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
            command: getConfig().language.python,
            args: [binPath],
            spawnOption: {
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
