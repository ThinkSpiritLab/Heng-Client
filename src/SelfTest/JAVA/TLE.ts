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
        while (true) {
            Scanner sc = new Scanner(System.in);
            int a = sc.nextInt();
            int b = sc.nextInt();
            System.out.println(a + b + 1);
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
        input,
        output,
        expectResultType: JudgeResultKind.RuntimeError,
        count: false,
    })),
    2000
);
