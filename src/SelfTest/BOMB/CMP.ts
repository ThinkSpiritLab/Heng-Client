import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `
`;
const output = `
`;
const usrCode = `
`;

export const BOMBCMP = generateNormalSelfTest("BOMBCMP", "cmp", usrCode, {}, [
    {
        type: "direct",
        input,
        output,
        expectResultType: JudgeResultKind.SystemError,
        count: false,
    },
]);
