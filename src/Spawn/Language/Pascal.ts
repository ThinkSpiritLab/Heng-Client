import path from "path";
import { getConfig } from "../../Config";
import { RunOption, Language, LanguageConfigureOption } from "./decl";

export class Pascal extends Language {
    private src = "src.pas";
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
            `-o${path.join(this.compileDir, this.bin)}`,
            "-vnw",
        ];
        if (this.excutable.environment.options?.o2 !== false) {
            compilerOptions.push("-O2");
        }

        return {
            skip: false,
            command: getConfig().language.pascal,
            args: compilerOptions,
            spawnOption: {
                bindMount: [
                    {
                        source: this.compileDir,
                        mode: "rw",
                    },
                ],
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
