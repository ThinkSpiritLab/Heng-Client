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
        };
    }

    execOptionGenerator(): RunOption {
        return {
            skip: true,
        };
    }

    get srcFileName() {
        return "main.v";
    }
}
