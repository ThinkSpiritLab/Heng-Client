import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `
`;
const output = `1
`;
const usrCode = `
#include <signal.h>

int main(void)
{
    kill(1, SIGKILL); // init
    kill(3, SIGKILL); // timer
    return 0;
}
`;

export const KILLTIMER = generateNormalSelfTest(
    "KILLTIMER",
    "c",
    usrCode,
    {},
    [
        {
            type: "direct",
            input,
            output,
            expectResultType: JudgeResultKind.WrongAnswer,
            count: false,
        },
    ],
    2000
);
