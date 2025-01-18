import { CMP } from "./CMP";
import { Language, LanguageConfigureOption } from "./decl";
import { PlainText } from "./PlainText";
import { Verilog } from "./Verilog";

export function getConfiguredLanguage(
    lang: string,
    option: LanguageConfigureOption
): Language {
    lang = lang.toLowerCase();
    switch (lang) {
        case "verilog":
            return new Verilog(option);
            break;
        case "plaintext":
            return new PlainText(option);
            break;
        case "cmp":
            return new CMP(option);
        default:
            throw new Error("Unrecognized language");
            break;
    }
}
