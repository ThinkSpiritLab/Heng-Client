import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `1 2
`;
const output = `3
`;
const usrCode = `
package sss;
`;

export const JavaPackage = generateNormalSelfTest(
    "JavaPackage",
    "java",
    usrCode,
    {},
    [
        {
            type: "direct",
            input,
            output,
            expectResultType: JudgeResultKind.CompileError,
            count: false,
        },
    ]
);
