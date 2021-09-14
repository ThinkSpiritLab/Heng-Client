import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `
`;
const output = `1 2
`;
const usrCode = ` 1 2
`;

export const PlainTextPE = generateNormalSelfTest(
    "PlainTextPE",
    "plaintext",
    usrCode,
    {},
    [
        {
            type: "direct",
            input,
            output,
            expectResultType: JudgeResultKind.WrongAnswer,
            count: false,
        },
    ]
);
