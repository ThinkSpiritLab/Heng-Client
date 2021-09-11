import { CMP } from "./CMP";
import { CPP } from "./CPP";
import { Language, LanguageConfigureOption } from "./decl";

export function getConfiguredLanguage(
    lang: string,
    option: LanguageConfigureOption
): Language {
    lang = lang.toLowerCase();
    switch (lang) {
        // case "c":
        //     return new C(option);
        //     break;
        case "cpp":
        case "cxx":
        case "c++":
            return new CPP(option);
            break;
        case "cmp":
            return new CMP(option);
        default:
            throw new Error("Unrecognized language");
            break;
    }
}
