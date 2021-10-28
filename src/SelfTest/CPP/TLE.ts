import { JudgeResultKind } from "heng-protocol";
import { range } from "lodash";
import { generateNormalSelfTest } from "../util";

const input = `
`;
const output = `
`;
const usrCode = `
#include <bits/stdc++.h>
int main(void) {
    while(1);
    return 0;
}
`;

export const CppTLE = generateNormalSelfTest(
    "CppTLE",
    "cpp",
    usrCode,
    {},
    range(2).map(() => ({
        type: "direct",
        input,
        output,
        expectResultType: JudgeResultKind.TimeLimitExceeded,
        count: false,
    })),
    2000
);
