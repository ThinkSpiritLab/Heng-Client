import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `1 2
`;
const output = `3
`;
const usrCode = `
s = input().split()
print(int(s[0]) + int(s[1]))
`;

export const PythonAC = generateNormalSelfTest(
    "PythonAC",
    "python3",
    usrCode,
    {},
    [
        {
            input,
            output,
            expectResultType: JudgeResultKind.Accepted,
            count: false,
        },
    ]
);
