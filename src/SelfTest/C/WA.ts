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
    printf("%d\\n", a + b + 1);
    return 0;
}
`;

export const CWA = generateNormalSelfTest("CWA", "c", usrCode, {}, [
    {
        input,
        output,
        expectResultType: JudgeResultKind.WrongAnswer,
        count: false,
    },
]);
