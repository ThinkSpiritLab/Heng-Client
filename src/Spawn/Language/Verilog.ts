import { join } from "path";
import { getConfig } from "../../Config";
import { Language, RunOption, RunType } from "./decl";

export class Verilog extends Language {
    srcFileName = "main.v";

    [RunType.Synthesis] = {
        cacheable: true,
        outputFiles: [join(this.runDir, "main.ngc")],
        optionGenerator() {
            return {
                skip: false,
                command: getConfig().language.xst,
                args: ["-ifn", "xc6slx9-2-ftg256.verilog.xst"],
            };
        },
    };

    [RunType.Translate] = {
        cacheable: true,
        outputFiles: [join(this.runDir, "main.ngd")],
        optionGenerator() {
            return {
                skip: false,
                command: getConfig().language.ngdbuild,
                args: ["-aul", "-uc", "ax309.ucf", "main"],
            };
        },
    };

    [RunType.Map] = {
        cacheable: true,
        outputFiles: [join(this.runDir, "main.ncd")],
        optionGenerator() {
            return {
                skip: false,
                command: getConfig().language.map,
                args: ["main"],
            };
        },
    };

    [RunType.Implement] = {
        cacheable: true,
        outputFiles: [join(this.runDir, "par.ncd")],
        optionGenerator() {
            return {
                skip: false,
                command: getConfig().language.par,
                args: ["main", "par"],
            };
        },
    };

    [RunType.Generate] = {
        cacheable: true,
        outputFiles: [join(this.runDir, "par.bit")],
        optionGenerator() {
            return {
                skip: false,
                command: getConfig().language.bitgen,
                args: ["par"],
            };
        },
    };

    pragramOptionGenerator(): RunOption {
        return {
            skip: false,
            command: getConfig().language.impact,
            args: ["-batch", "main.cmd"],
        };
    }
}
