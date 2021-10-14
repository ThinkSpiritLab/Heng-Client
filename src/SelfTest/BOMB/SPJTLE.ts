import { JudgeResultKind } from "heng-protocol";
import { generateSpjSelfTest } from "../util";

const input = `1 7
`;
const output = `
`;
const usrCode = `
#include <bits/stdc++.h>
using namespace std;

int main(void) {
    srand(time(0));
    long long a, b;
    cin >> a >> b;
    int rd = rand();
    cout << a + rd << ' ' << b - rd << endl;
    return 0;
}
`;

const spjCode = `
#include <bits/stdc++.h>
using namespace std;
int main(void) {
    while(true) {
        ;
    }
    return 0;
}
`;

export const BOMBSPJTLE = generateSpjSelfTest(
    "BOMBSPJTLE",
    "cpp",
    usrCode,
    {},
    spjCode,
    {},
    [
        {
            type: "direct",
            input,
            output,
            expectResultType: JudgeResultKind.SystemTimeLimitExceeded,
            count: false,
        },
    ],
    2000
);
