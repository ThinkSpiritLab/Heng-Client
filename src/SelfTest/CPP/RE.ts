import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `1 2
`;
const output = `3
`;
const usrCode = `
#include <bits/stdc++.h>
using namespace std;

int a[1000] = {};

int main(void)
{
    for (int i = 0; i < 1000000000; i++)
    {
        a[i] = 1;
    }
    for (int i = 0; i < 1000000000; i++)
    {
        printf("");
    }
    return 0;
}
`;

export const CppRE = generateNormalSelfTest("CppRE", "cpp", usrCode, {}, [
    {
        type: "direct",
        input,
        output,
        expectResultType: JudgeResultKind.RuntimeError,
        count: false,
    },
]);
