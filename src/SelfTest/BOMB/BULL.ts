import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `
`;
const output = `
`;
const usrCode = `
#include <stdio.h>
int main(void) {
    while(1) printf("1");
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
            expectResultType: JudgeResultKind.OutpuLimitExceeded,
            count: false,
        },
    ],
    2000
);
