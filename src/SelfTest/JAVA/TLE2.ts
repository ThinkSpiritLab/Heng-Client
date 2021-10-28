import { JudgeResultKind } from "heng-protocol";
import { range } from "lodash";
import { generateNormalSelfTest } from "../util";

const input = `
`;
const output = `
`;
const usrCode = `
import java.util.Scanner;


public class Main {
    public static void main(String[] args) {
        int a = 0;
        while (true) {
            a++;
        }
    }
}
`;

export const JavaTLE2 = generateNormalSelfTest(
    "JavaTLE2",
    "java",
    usrCode,
    {},
    range(2).map(() => ({
        type: "direct",
        input,
        output,
        expectResultType: JudgeResultKind.TimeLimitExceeded,
        count: false,
    })),
    2000
);
