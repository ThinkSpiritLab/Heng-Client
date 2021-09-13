import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `1 2
`;
const output = `3
`;
const usrCode = `
#include <bits/stdc++.h>
using namespace std;

int main(void) {
    std::map<std::string, int> map;
    map["nihao"] = 1;
    map["shijie"] = 2;
    if (auto ret = map.begin(); ret != map.end()) {
        std::cout << ret->first << ": " << ret->second;
    }
}
`;

export const CppOption = generateNormalSelfTest(
    "CppOption",
    "cpp",
    usrCode,
    { version: "c++11" },
    [
        {
            type: "direct",
            input,
            output,
            expectResultType: JudgeResultKind.CompileError,
            count: false,
        },
    ]
);
