import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `1 2
`;
const output = `3
`;
const usrCode = `
#include <bits/stdc++.h>
using namespace std;

int main(void) {
    int a, b;
    cin >> a >> b;
    cout << a + b + 1 << endl;
    return 0;
}
`;

export const CppWA = generateNormalSelfTest("CppWA", "cpp", usrCode, {}, [
    {
        type: "direct",
        input,
        output,
        expectResultType: JudgeResultKind.WrongAnswer,
        count: false,
    },
]);
