import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from ".";

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

export const NormalWA = generateNormalSelfTest("NormalWA", "cpp", usrCode, [
    {
        input,
        output,
        expectResultType: JudgeResultKind.WrongAnswer,
        count: false,
    },
]);