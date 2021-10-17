import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `
`;
const output = `
`;
const usrCode = `
#include <stdio.h>
#include <unistd.h>
int main(void) {
    for (int i = 0; i < 1000000000; i++) {
        write(1, "11111111111111111111111111111111111\\n", 37);
    }
    return 0;
}
`;

export const BOMBBULL = generateNormalSelfTest(
    "BOMBBULL",
    "c",
    usrCode,
    {},
    [
        {
            type: "direct",
            input,
            output,
            expectResultType: JudgeResultKind.TimeLimitExceeded,
            count: false,
        },
    ],
    2000
);
