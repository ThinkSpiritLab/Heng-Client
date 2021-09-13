import { JudgeResultKind } from "heng-protocol";
import { generateInteractorSelfTest } from "../util";

const input = `1764335
`;
const output = `
`;
const input2 = `1
`;
const output2 = `
`;
const usrCode = `
#include <cstdio>
#include <iostream>

int main()
{
    for (int l = 1, r = 1000000000, mid = (l + r) >> 1, res; l <= r; mid = (l + r) >> 1)
    {
        std::cout << mid << std::endl;
        std::cin >> res;
        if (res == 0)
        {
            return 0;
        }
        else if (res == -1)
        {
            l = mid + 1;
        }
        else if (res == 1)
        {
            r = mid - 1;
        }
        else
        {
            puts("OvO, I AK IOI"); // this statement will never be executed.
        }
    }
    return 0;
}
`;

const interactorCode = `
#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;

int main(int argc, char ** argv){
	registerInteraction(argc, argv);
	int n = inf.readInt();	// chosen integer
	cout.flush();	// to make sure output doesn't stuck in some buffer
	int left = 50;
	bool found = false;
	while(left > 0 && !found){
		left --;
		int a = ouf.readInt(1, 1000000000);	// the number you tell me
		if(a < n)
			cout << -1 << endl;
		else if(a > n)
			cout << 1 << endl;
		else
			cout << 0 << endl, found = true;
		cout.flush();
	}
	if(!found)
		quitf(_wa, "couldn't guess the number with 50 questions");
	quitf(_ok, "guessed the number with %d questions!", 50 - left);

}
`;

export const InteractorGuessNumber = generateInteractorSelfTest(
    "InteractorGuessNumber",
    "cpp",
    usrCode,
    {},
    interactorCode,
    {},
    [
        {
            type: "direct",
            input,
            output,
            expectResultType: JudgeResultKind.Accepted,
            count: false,
        },
        {
            type: "direct",
            input: input2,
            output: output2,
            expectResultType: JudgeResultKind.Accepted,
            count: false,
        },
    ]
);
