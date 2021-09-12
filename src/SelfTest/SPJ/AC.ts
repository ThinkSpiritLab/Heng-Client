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
    FILE *f = fdopen(3, "r"); // input
    FILE *d = fdopen(4, "r"); // stdOutput

    int a, b;
    fscanf(f, "%d%d", &a, &b);

    int x, y;
    scanf("%d%d", &x, &y); // usrOutput
    if (x + y == a + b)
        std::cout << "AC";
    else
        std::cout << "WA";
    return 0;
}
`;

export const SpjAC = generateSpjSelfTest("SpjAC", "cpp", usrCode, spjCode, [
    {
        input,
        output,
        expectResultType: JudgeResultKind.Accepted,
        count: false,
    },
]);
