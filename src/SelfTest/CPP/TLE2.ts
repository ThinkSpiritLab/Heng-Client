import { JudgeResultKind } from "heng-protocol";
import { range } from "lodash";
import { generateNormalSelfTest } from "../util";

const input = `
`;
const output = `
`;
const usrCode = `
#include <bits/stdc++.h>
#include <unistd.h>
using namespace std;
int main(void) {
    sleep(100);
    return 0;
}
`;

export const CppTLE2 = generateNormalSelfTest(
    "CppTLE2",
    "cpp",
    usrCode,
    {},
    range(2).map(() => ({
        input,
        output,
        expectResultType: JudgeResultKind.RuntimeError,
        count: false,
    })),
    2000
);
