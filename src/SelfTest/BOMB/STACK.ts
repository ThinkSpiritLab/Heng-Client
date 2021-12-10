import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `
`;
const output = `67108864
67108864
`;
const usrCode = `
#include <stdio.h>
#include <sys/resource.h>
int main(void)
{
    struct rlimit r;
    if (getrlimit(RLIMIT_STACK, &r) < 0)
    {
        fprintf(stderr, "getrlimit error\\n");
        return 1;
    }
    printf("%d\\n", r.rlim_cur);
    printf("%d\\n", r.rlim_max);

    return 0;
}
`;

export const BOOMSTACK = generateNormalSelfTest("BOOMSTACK", "c", usrCode, {}, [
    {
        type: "direct",
        input,
        output,
        expectResultType: JudgeResultKind.Accepted,
        count: false,
    },
]);
