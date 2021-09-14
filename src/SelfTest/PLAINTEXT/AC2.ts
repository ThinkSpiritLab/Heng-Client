import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `
`;
const output = `1 2
3 4
`;
const usrCode = `1 2 
3 4 
`;

export const PlainTextAC2 = generateNormalSelfTest(
    "PlainTextAC2",
    "plaintext",
    usrCode,
    {},
    [
        {
            type: "direct",
            input,
            output,
            expectResultType: JudgeResultKind.Accepted,
            count: false,
        },
    ]
);
