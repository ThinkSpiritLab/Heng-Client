import path from "path";
import { getConfig } from "../../Config";
import { RunOption, Language, LanguageConfigureOption } from "./decl";

export class Rust extends Language {
    private src = "src.rs";
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
            "-O",
        ];
        return {
            skip: false,
            command: getConfig().language.rustc,
            args: compilerOptions,
            spawnOption: {
                bindMount: [
                    {
                        source: this.compileDir,
                        mode: "rw",
                    },
                ],
                tmpfsMount: [
                    {
                        dest: "/tmp",
                        size: 128 * 1024 * 1024, // 128M
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
