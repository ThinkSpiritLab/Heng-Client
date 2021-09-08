import { JudgeResultKind } from "heng-protocol";
import { range } from "lodash";
import { generateNormalSelfTest } from ".";

const input = `
`;
const output = `0
`;
const usrCode = `
#include <bits/stdc++.h>
using namespace std;
#define ll long long
#define ull unsigned long long
#define db double
#define ld long double
#define inf 0x7fffffff
#define eps 1e-6
// #define mod 998244353
#define maxn 10000007

int n = 10000000;
int a[maxn];
int lowbit(int x) { return x & (-x); }

void insert(int pos) {
    while (pos <= n) {
        a[pos]++;
        pos += lowbit(pos);
    }
}

int query(int x) {
    int ans = 0;
    while (x > 0) {
        ans += a[x];
        x -= lowbit(x);
    }
    return ans;
}

int main(void) {
    int x = 10000000;
    while (--x) {
        insert(x);
        insert(x);
        insert(x);
        insert(x);
    }
    cout << query(0) << endl;
    return 0;
}
`;

export const NormalTime1 = generateNormalSelfTest(
    "NormalTime1",
    "cpp",
    usrCode,
    range(20).map(() => {
        return {
            input,
            output,
            expectResultType: JudgeResultKind.Accepted,
            count: true,
            expectedTime: 1000,
        };
    })
);
