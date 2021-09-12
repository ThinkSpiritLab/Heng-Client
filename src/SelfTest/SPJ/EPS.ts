import { JudgeResultKind } from "heng-protocol";
import { generateSpjSelfTest } from "../util";

const input = `1 7
`;
const output = `0.1428571428
`;
const input2 = `100000000 3
`;
const output2 = `33333333.3333333
`;
const input3 = `100000000 0
`;
const output3 = `nan
`;
const usrCode = `
#include <bits/stdc++.h>
using namespace std;

int main(void) {
    long long a, b;
    scanf("%lld%lld", &a, &b);
    printf("%.12lf", (1.0 + 1e-7) * a / b);
    return 0;
}
`;

const spjCode = `
#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
#define eps 1e-6

int main(int argc, char *argv[]) {
    registerTestlibCmd(argc, argv);

    double std = ans.readDouble();
    double usr = ouf.readDouble();

    if (fabs(std - usr) > eps && fabs(std - usr) > std * eps)
        quitf(_wa, "expected %.10f, found %.10f", std, usr);

    quitf(_ok, "answer is %.10f", std);
}
`;

export const SpjEPS = generateSpjSelfTest("SpjEPS", "cpp", usrCode, spjCode, [
    {
        input,
        output,
        expectResultType: JudgeResultKind.Accepted,
        count: false,
    },
    {
        input: input2,
        output: output2,
        expectResultType: JudgeResultKind.Accepted,
        count: false,
    },
    {
        input: input3,
        output: output3,
        expectResultType: JudgeResultKind.WrongAnswer,
        count: false,
    },
]);
