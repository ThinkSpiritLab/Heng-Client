import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `1 2
`;
const output = `3
`;
const usrCode = `
import java.util.Scanner;


public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt();
        int b = sc.nextInt();
        System.out.println(a + b + 1);
    }
}
`;

export const JavaWA = generateNormalSelfTest("JavaWA", "java", usrCode, {}, [
    {
        input,
        output,
        expectResultType: JudgeResultKind.WrongAnswer,
        count: false,
    },
]);
