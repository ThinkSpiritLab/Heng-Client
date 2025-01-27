import path from "path";
import { getConfig } from "../../Config";
import {
    ExecType,
    Language,
    LanguageConfigureOption,
    RunOption,
    RunType,
} from "./decl";

export class PlainText extends Language {
    constructor(option: LanguageConfigureOption) {
        super(option);
        if (this.execType !== ExecType.Usr)
            throw new Error("Unrecognized language");
    }

    srcFileName = "src.in";

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

    pragramOptionGenerator(): RunOption {
        const binPath = path.join(this.runDir, this.srcFileName);
        return {
            skip: false,
            command: getConfig().language.cat,
            args: [binPath],
        };
    }
}
