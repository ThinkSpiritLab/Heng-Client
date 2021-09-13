import { JudgeResultKind } from "heng-protocol";
import { CreateJudgeArgs } from "heng-protocol/internal-protocol/ws";
export type TestCase = {
    type: "direct" | "url";
    input: string;
    output: string;
} & {
    expectResultType: JudgeResultKind;
} & ({ count: true; expectedTime: number } | { count: false });
export type ExpectedResult = {
    expectResultType: JudgeResultKind;
} & ({ count: true; expectedTime: number } | { count: false });
export type SelfTest = {
    name: string;
    task: CreateJudgeArgs;
    expectedResult: ExpectedResult[];
};
export const MaxMemory = 512 * 1024 * 1024;
export const MaxOutput = 128 * 1024 * 1024;
export const MaxTime = 10000;
