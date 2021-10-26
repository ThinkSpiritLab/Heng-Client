import path from "path";
import { getConfig } from "../../Config";
import { JailBindMountOption } from "../Jail";
import { RunOption, Language, LanguageConfigureOption } from "./decl";

export class CPP extends Language {
    private src = "src.cpp";
    private bin = "src";

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
        const compilerOptions: string[] = [
            path.join(this.compileDir, this.src),
            "-o",
            path.join(this.compileDir, this.bin),
            this.excutable.environment.options?.version !== undefined
                ? `--std=${this.excutable.environment.options.version}`
                : "--std=c++17",
        ];
        // default on
        if (this.excutable.environment.options?.o2 !== false) {
            compilerOptions.push("-O2");
        } else {
            compilerOptions.push("-O0");
        }
        // default on
        if (this.excutable.environment.options?.static !== false) {
            compilerOptions.push("-static");
        }
        // default on
        if (this.excutable.environment.options?.lm !== false) {
            compilerOptions.push("-lm");
        }
        const bindMount: JailBindMountOption[] = [
            {
                source: this.compileDir,
                mode: "rw",
            },
        ];
        // default off
        if (this.excutable.environment.options?.testlib === true) {
            bindMount.push({
                source: getConfig().language.testlib,
                dest: path.join(this.compileDir, "testlib.h"),
                mode: "ro",
            });
        }
        return {
            skip: false,
            command: getConfig().language.cpp,
            args: compilerOptions,
            jailSpawnOption: {
                bindMount: bindMount,
            },
        };
    }

    get compiledFiles(): string[] {
        return [path.join(this.compileDir, this.bin)];
    }

    execOptionGenerator(): RunOption {
        const binPath = path.join(this.compileDir, this.bin);
        return {
            skip: false,
            command: binPath,
            spawnOption: {},
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
