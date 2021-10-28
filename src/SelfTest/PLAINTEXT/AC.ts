import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `
`;
const output = `1 2
`;
const usrCode = `1 2
`;

export const PlainTextAC = generateNormalSelfTest(
    "PlainTextAC",
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
