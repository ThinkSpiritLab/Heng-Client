import { BOMB } from "./BOMB";
import { C } from "./C";
import { CPP } from "./CPP";
import { INTERACTOR } from "./INTERACTOR";
import { JAVA } from "./JAVA";
import { JS } from "./JS";
import { PASCAL } from "./PASCAL";
import { PYTHON } from "./PYTHON";
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
    ...INTERACTOR,
];
