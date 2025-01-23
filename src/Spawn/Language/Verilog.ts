import { join } from "path";
import { Language, RunOption } from "./decl";
import { getConfig } from "../../Config";

export class Verilog extends Language {
    get compileCacheable() {
        return true;
    }

    get compiledFiles() {
        return [join(this.compileDir, "par.bit")];
    }

    compileOptionGenerator(): RunOption {
        return {
            skip: false,
            command: getConfig().language.verilog,
            args: [getConfig().language.ise],
            spawnOption: {
                timeLimit: 60000,
            },
        };
    }

    get judgeTimeout() {
        return 1000;
    }

    pragramOptionGenerator(): RunOption {
        return {
            skip: false,
            command: getConfig().language.impact,
            args: ["-batch", "main.cmd"],
            spawnOption: {
                timeLimit: 10000,
            },
        };
    }

    get srcFileName() {
        return "main.v";
    }
}
