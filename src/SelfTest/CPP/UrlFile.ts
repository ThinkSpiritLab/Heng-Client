import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = "https://www.ssst.top/in";
const output = "https://www.ssst.top/out";
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

export const CppUrlFile = generateNormalSelfTest(
    "CppUrlFile",
    "cpp",
    usrCode,
    {},
    [
        {
            type: "url",
            input,
            inHashSum:
                "abcce1c67dc75c397011d047a8b4cd6c06734a8dd12335a3d27adcfc3dfc2a7f",
            output,
            outHashSum:
                "1121cfccd5913f0a63fec40a6ffd44ea64f9dc135c66634ba001d10bcf4302a2",
            expectResultType: JudgeResultKind.Accepted,
            count: false,
        },
        {
            type: "url",
            input,
            inHashSum:
                "abcce1c67dc75c397011d047a8b4cd6c06734a8dd12335a3d27adcfc3dfc2a7f",
            output,
            outHashSum:
                "1121cfccd5913f0a63fec40a6ffd44ea64f9dc135c66634ba001d10bcf4302a2",
            expectResultType: JudgeResultKind.Accepted,
            count: false,
        },
    ]
);
