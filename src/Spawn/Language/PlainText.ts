import path from "path";
import { getConfig } from "../../Config";
import {
    RunOption,
    Language,
    LanguageConfigureOption,
    ExecType,
    RunType,
} from "./decl";

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

    pragramOptionGenerator(): RunOption {
        const binPath = path.join(this.runDir, this.src);
        return {
            skip: false,
            command: getConfig().language.cat,
            args: [binPath],
        };
    }

    get judgeTimeout() {
        return 1000;
    }

    [RunType.Synthesis] = {
        cacheable: true,
        outputFiles: [],
        optionGenerator(): RunOption {
            return { skip: true };
        },
    };

    [RunType.Translate] = {
        cacheable: true,
        outputFiles: [],
        optionGenerator(): RunOption {
            return { skip: true };
        },
    };

    [RunType.Map] = {
        cacheable: true,
        outputFiles: [],
        optionGenerator(): RunOption {
            return { skip: true };
        },
    };

    [RunType.Implement] = {
        cacheable: true,
        outputFiles: [],
        optionGenerator(): RunOption {
            return { skip: true };
        },
    };

    [RunType.Generate] = {
        cacheable: true,
        outputFiles: [],
        optionGenerator(): RunOption {
            return { skip: true };
        },
    };
}
