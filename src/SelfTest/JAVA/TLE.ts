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
        try {
            Thread.sleep(100000);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
    }
}
`;

export const JavaTLE = generateNormalSelfTest(
    "JavaTLE",
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
