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
        Scanner sc=new Scanner(System.in);
        int a=sc.nextInt(),b=sc.nextInt();
        System.out.println(a+b);
    }    
}
`;

export const JavaAC = generateNormalSelfTest("JavaAC", "java", usrCode, [
    {
        input,
        output,
        expectResultType: JudgeResultKind.Accepted,
        count: false,
    },
]);
