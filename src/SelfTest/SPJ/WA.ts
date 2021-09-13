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
    cout << a + rd << ' ' << b << endl;
    return 0;
}
`;

const spjCode = `
#include "testlib.h"

int main(int argc, char *argv[])
{
    registerTestlibCmd(argc, argv);

    int a, b, x, y;
    a = inf.readInt();
    b = inf.readInt();
    x = ouf.readInt();
    y = ouf.readInt();
    if (x + y == a + b)
    {
        quitf(_ok, "expected %d, found %d", a + b, x + y);
    }
    else
    {
        quitf(_wa, "expected %d, found %d", a + b, x + y);
    }
    return 0;
}
`;

export const SpjWA = generateSpjSelfTest(
    "SpjWA",
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
            expectResultType: JudgeResultKind.WrongAnswer,
            count: false,
        },
    ]
);
