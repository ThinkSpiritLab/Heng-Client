import { RunOption, Language, LanguageConfigureOption } from "./decl";

export class C extends Language {
    readonly src = "src.c";
    readonly bin = "src";
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
        return { skip: true };
    }

    execOptionGenerator(): RunOption {
        return { skip: true };
    }
}
