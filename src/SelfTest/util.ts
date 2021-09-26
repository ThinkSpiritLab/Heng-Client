import { DynamicFile, JudgeType, TestPolicy } from "heng-protocol";
import * as crypto from "crypto";
import { MaxMemory, MaxOutput, MaxTime, SelfTest, TestCase } from "./decl";

export function generateNormalSelfTest(
    name: string,
    language: string,
    usrCode: string,
    usrOption: { [key: string]: string | number | boolean },
    cases: TestCase[],
    timeLimit: number = MaxTime
): SelfTest {
    const fileArray: DynamicFile[] = [];
    cases.forEach((c, idx) => {
        if (c.type === "direct") {
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
        } else {
            fileArray.push({
                type: "remote",
                name: "in" + idx,
                file: {
                    type: "url",
                    url: c.input,
                },
            });
            fileArray.push({
                type: "remote",
                name: "out" + idx,
                file: {
                    type: "url",
                    url: c.output,
                },
            });
        }
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
                        options: usrOption,
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
export function generateSpjSelfTest(
    name: string,
    language: string,
    usrCode: string,
    usrOption: { [key: string]: string | number | boolean },
    spjCode: string,
    spjOption: { [key: string]: string | number | boolean },
    cases: TestCase[],
    timeLimit: number = MaxTime
): SelfTest {
    const fileArray: DynamicFile[] = [];
    cases.forEach((c, idx) => {
        if (c.type === "direct") {
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
        } else {
            fileArray.push({
                type: "remote",
                name: "in" + idx,
                file: {
                    type: "url",
                    url: c.input,
                },
            });
            fileArray.push({
                type: "remote",
                name: "out" + idx,
                file: {
                    type: "url",
                    url: c.output,
                },
            });
        }
    });

    return {
        name,
        task: {
            id: crypto.randomBytes(32).toString("hex"),
            dynamicFiles: fileArray,
            judge: {
                type: JudgeType.Special,
                user: {
                    source: {
                        type: "direct",
                        content: usrCode,
                    },
                    environment: {
                        language: language,
                        system: "Linux",
                        arch: "x64",
                        options: usrOption,
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
                spj: {
                    source: {
                        type: "direct",
                        content: spjCode,
                    },
                    environment: {
                        language: language,
                        system: "Linux",
                        arch: "x64",
                        options: spjOption,
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

export function generateInteractiveSelfTest(
    name: string,
    language: string,
    usrCode: string,
    usrOption: { [key: string]: string | number | boolean },
    interactorCode: string,
    interactorOption: { [key: string]: string | number | boolean },
    cases: TestCase[],
    timeLimit: number = MaxTime
): SelfTest {
    const fileArray: DynamicFile[] = [];
    cases.forEach((c, idx) => {
        if (c.type === "direct") {
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
        } else {
            fileArray.push({
                type: "remote",
                name: "in" + idx,
                file: {
                    type: "url",
                    url: c.input,
                },
            });
            fileArray.push({
                type: "remote",
                name: "out" + idx,
                file: {
                    type: "url",
                    url: c.output,
                },
            });
        }
    });

    return {
        name,
        task: {
            id: crypto.randomBytes(32).toString("hex"),
            dynamicFiles: fileArray,
            judge: {
                type: JudgeType.Interactive,
                user: {
                    source: {
                        type: "direct",
                        content: usrCode,
                    },
                    environment: {
                        language: language,
                        system: "Linux",
                        arch: "x64",
                        options: usrOption,
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
                interactor: {
                    source: {
                        type: "direct",
                        content: interactorCode,
                    },
                    environment: {
                        language: language,
                        system: "Linux",
                        arch: "x64",
                        options: interactorOption,
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
