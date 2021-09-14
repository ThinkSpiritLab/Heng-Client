import path from "path";
import { getConfig } from "../../Config";
import { RunOption, Language, LanguageConfigureOption } from "./decl";

export class Java extends Language {
    private className = "Main";
    private src = "Main.java";
    private bin = "Main.class";

    constructor(option: LanguageConfigureOption) {
        super(option);
        if (
            this.excutable.environment.options?.className &&
            typeof this.excutable.environment.options?.className === "string"
        ) {
            this.className = this.excutable.environment.options?.className;
            this.src = this.excutable.environment.options?.className + ".java";
            this.bin = this.excutable.environment.options?.className + ".class";
        }
    }

    get compileCacheable(): boolean {
        return true;
    }

    get srcFileName(): string {
        return this.src;
    }

    compileOptionGenerator(): RunOption {
        const args: string[] = [];
        args.push("-encoding", "UTF-8");
        args.push("-sourcepath", this.compileDir);
        args.push("-d", this.compileDir);
        args.push(path.join(this.compileDir, this.src));
        return {
            skip: false,
            command: getConfig().language.javac,
            args: args,
        };
    }

    execOptionGenerator(): RunOption {
        const binPath = path.join(this.compileDir, this.bin);
        const args: string[] = [];
        args.push(
            this.excutable.environment.options?.stackSize
                ? `-Xss${this.excutable.environment.options.stackSize}k`
                : "-Xss256k",
            `-Xms${Math.ceil(
                (this.excutable.limit.runtime.memory * 1.5) / 1024 / 1024 / 4
            )}m`,
            `-Xmx${Math.ceil(
                (this.excutable.limit.runtime.memory * 1.5) / 1024 / 1024
            )}m`
        );
        args.push("-classpath", this.compileDir);
        args.push(this.className);
        return {
            skip: false,
            command: getConfig().language.java,
            args: args,
            jailSpawnOption: {
                bindMount: [
                    {
                        source: binPath,
                        mode: "ro",
                    },
                ],
                memorylimit: this.excutable.limit.runtime.memory * 2,
            },
        };
    }
}
