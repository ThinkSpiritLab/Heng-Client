import { BOMB } from "./BOMB";
import { C } from "./C";
import { CPP } from "./CPP";
import { INTERACTIVE } from "./INTERACTIVE";
import { JAVA } from "./JAVA";
// import { JS } from "./JS";
// import { PASCAL } from "./PASCAL";
import { PLAINTEXT } from "./PLAINTEXT";
import { PYTHON } from "./PYTHON";
import { RUST } from "./Rust";
import { SPJ } from "./SPJ";
import { TIME } from "./Time";

export const Tests = [
    ...C,
    ...CPP,
    ...JAVA,
    ...PYTHON,
    // ...JS,
    // ...PASCAL,
    ...TIME,
    ...SPJ,
    ...BOMB,
    ...INTERACTIVE,
    ...PLAINTEXT,
    ...RUST,
];
