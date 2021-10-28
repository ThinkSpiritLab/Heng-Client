import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = "in1";
const output = "out1";
const usrCode = `
#include <bits/stdc++.h>
using namespace std;

int main(void) {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}
`;

export const CppUrlData = generateNormalSelfTest(
    "CppUrlData",
    "cpp",
    usrCode,
    {},
    [
        {
            type: "primary",
            input,
            output,
            expectResultType: JudgeResultKind.Accepted,
            count: false,
        },
        {
            type: "primary",
            input,
            output,
            expectResultType: JudgeResultKind.Accepted,
            count: false,
        },
    ],
    undefined,
    {
        type: "url",
        hashsum:
            "af3cc8daa80ea5debe7732f462f9d7e3a02e4ea365ac3d22c55ed2aa27d435fd",
        url: "https://www.ssst.top/a_plus_b.zip",
    }
);
