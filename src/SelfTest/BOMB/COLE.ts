import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `1 2
`;
const output = `3
`;
const usrCode = `
int main[-1u]={1};
`;

export const BOMBCOLE = generateNormalSelfTest("BOMBCOLE", "c", usrCode, {}, [
    {
        input,
        output,
        expectResultType: JudgeResultKind.CompileError,
        count: false,
    },
]);
