import { DynamicFile } from "heng-protocol";
import { join } from "path";
import { getConfig } from "../../Config";
import { Language, RunOption, RunType } from "./decl";
import { getPrj, getXst } from "./XilinxSynthesisTechnology";

export class Verilog extends Language {
    static srcFileName = "main.v";
    static modifyDynamicFile(files: DynamicFile[] = []) {
        return [getPrj(this.srcFileName, files), getXst(), ...files];
    }

    srcFileName = Verilog.srcFileName;

    [RunType.Synthesis] = {
        cacheable: true,
        outputFiles: [join(this.runDir, "main.ngc")],
        optionGenerator() {
            return {
                skip: false,
                command: getConfig().language.xst,
                args: ["-ifn", "main.xst"],
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
