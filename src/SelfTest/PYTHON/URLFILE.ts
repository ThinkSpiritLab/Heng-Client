import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

// Discard, may bad internet
const input = "https://www.ssst.top/in";
const output = "https://www.ssst.top/out";
const usrCode = `
s = input().split()
print(int(s[0]) + int(s[1]))
`;

export const PythonURLFILE = generateNormalSelfTest(
    "PythonURLFILE",
    "python3",
    usrCode,
    {},
    [
        {
            type: "url",
            input,
            output,
            expectResultType: JudgeResultKind.Accepted,
            count: false,
        },
        {
            type: "url",
            input,
            output,
            expectResultType: JudgeResultKind.Accepted,
            count: false,
        },
    ]
);
