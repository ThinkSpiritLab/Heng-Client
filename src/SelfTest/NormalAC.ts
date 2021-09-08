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
    cout << a + b << endl;
    return 0;
}
`;

export const NormalAC = generateNormalSelfTest("NormalAC", "cpp", usrCode, [
    {
        input,
        output,
        expectResultType: JudgeResultKind.Accepted,
        count: false,
    },
]);
