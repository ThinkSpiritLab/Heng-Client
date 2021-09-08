import { JudgeResultKind } from "heng-protocol";
import { range } from "lodash";
import { generateNormalSelfTest } from ".";

const input = `
`;
const output = `
`;
const usrCode = `
#include <bits/stdc++.h>
using namespace std;
int main(void) {
    while(1);
    return 0;
}
`;

export const NormalTLE = generateNormalSelfTest(
    "NormalTLE",
    "cpp",
    usrCode,
    range(2).map(() => {
        return {
            input,
            output,
            expectResultType: JudgeResultKind.TimeLimitExceeded,
            count: false,
        };
    }),
    2000
);
