import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `1 2
`;
const output = `3
`;
const usrCode = `
#include <unistd.h>
int main(void)
{
    int n = 100;
    while(n--)
    {
        fork();
    }
    while(1)
        sleep(1);
    return 0;
}
`;

export const BOMBFORKBOMB = generateNormalSelfTest(
    "BOMBFORKBOMB",
    "c",
    usrCode,
    {},
    [
        {
            input,
            output,
            expectResultType: JudgeResultKind.RuntimeError,
            count: false,
        },
    ],
    2000
);
