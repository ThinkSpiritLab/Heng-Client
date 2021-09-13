import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `1 2
`;
const output = `3
`;
const usrCode = `
import java.util.Scanner;


public class APLUSB {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt();
        int b = sc.nextInt();
        System.out.println(a + b);
    }
}
`;

export const JavaOption = generateNormalSelfTest(
    "JavaOption",
    "java",
    usrCode,
    { className: "APLUSB" },
    [
        {
            type: "direct",
            input,
            output,
            expectResultType: JudgeResultKind.Accepted,
            count: false,
        },
    ]
);
