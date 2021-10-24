import { C } from "./C";
import { CMP } from "./CMP";
import { CPP } from "./CPP";
import { Language, LanguageConfigureOption } from "./decl";
import { Java } from "./Java";
import { JS } from "./JS";
import { Pascal } from "./Pascal";
import { PlainText } from "./PlainText";
import { Python } from "./Python";
import { Rust } from "./Rust";

export function getConfiguredLanguage(
    lang: string,
    option: LanguageConfigureOption
): Language {
    lang = lang.toLowerCase();
    switch (lang) {
        case "c":
            return new C(option);
            break;
        case "cpp":
        case "cxx":
        case "c++":
            return new CPP(option);
            break;
        case "java":
            return new Java(option);
            break;
        case "py":
        case "py3":
        case "python":
        case "python3":
            return new Python(option);
            break;
        case "plaintext":
            return new PlainText(option);
            break;
        case "rust":
            return new Rust(option);
            break;
        // case "js":
        // case "javascript":
        //     return new JS(option);
        //     break;
        // case "pascal":
        //     return new Pascal(option);
        //     break;
        case "cmp":
            return new CMP(option);
        default:
            throw new Error("Unrecognized language");
            break;
    }
}
