import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `1 2
`;
const output = `3
`;
const usrCode = `
#include <stdio.h>

int main(void) {
    int a, b;
    scanf("%d%d", &a, &b);
    printf("%d\\n", a + b);
    return 0;
}
`;

export const CAC = generateNormalSelfTest("CAC", "c", usrCode, {}, [
    {
        input,
        output,
        expectResultType: JudgeResultKind.Accepted,
        count: false,
    },
]);
