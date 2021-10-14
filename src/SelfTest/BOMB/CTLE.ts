import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `1 2
`;
const output = `3
`;
const usrCode = `
#include </dev/random>
`;

export const BOMBCTLE = generateNormalSelfTest("BOMBCTLE", "c", usrCode, {}, [
    {
        type: "direct",
        input,
        output,
        expectResultType: JudgeResultKind.CompileTimeLimitExceeded,
        count: false,
    },
]);
