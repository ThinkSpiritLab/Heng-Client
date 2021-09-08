import { DynamicFile, JudgeType, TestPolicy } from "heng-protocol";
import * as crypto from "crypto";
import { MaxMemory, MaxOutput, MaxTime, SelfTest, TestCase } from "./decl";

export function generateNormalSelfTest(
    name: string,
    language: string,
    usrCode: string,
    cases: TestCase[],
    timeLimit: number = MaxTime
): SelfTest {
    const fileArray: DynamicFile[] = [];
    cases.forEach((c, idx) => {
        fileArray.push({
            type: "remote",
            name: "in" + idx,
            file: {
                type: "direct",
                content: c.input,
            },
        });
        fileArray.push({
            type: "remote",
            name: "out" + idx,
            file: {
                type: "direct",
                content: c.output,
            },
        });
    });

    return {
        name,
        task: {
            id: crypto.randomBytes(32).toString("hex"),
            dynamicFiles: fileArray,
            judge: {
                type: JudgeType.Normal,
                user: {
                    source: {
                        type: "direct",
                        content: usrCode,
                    },
                    environment: {
                        language: language,
                        system: "Linux",
                        arch: "x64",
                        options: {},
                    },
                    limit: {
                        runtime: {
                            cpuTime: timeLimit,
                            memory: MaxMemory,
                            output: MaxOutput,
                        },
                        compiler: {
                            cpuTime: MaxTime,
                            memory: MaxMemory,
                            output: MaxOutput,
                            message: MaxOutput,
                        },
                    },
                },
            },
            test: {
                cases: cases.map((value, idx) => {
                    return { input: "in" + idx, output: "out" + idx };
                }),
                policy: TestPolicy.All,
            },
        },
        expectedResult: cases.map((c) => {
            return c.count
                ? {
                      count: c.count,
                      expectedTime: c.expectedTime,
                      expectResultType: c.expectResultType,
                  }
                : {
                      count: c.count,
                      expectResultType: c.expectResultType,
                  };
        }),
    };
}

import { NormalWA } from "./NormalWA";
import { NormalAC } from "./NormalAC";
import { NormalTime1 } from "./NormalTime1";
import { NormalTLE } from "./NormalTLE";

export const Tests = [NormalWA, NormalAC, NormalTLE, NormalTime1];
