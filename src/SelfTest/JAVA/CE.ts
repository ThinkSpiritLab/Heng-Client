import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `1 2
`;
const output = `3
`;
const usrCode = `
public class Main {
    public static void main(String[] args) {
        int dp[] = new int[500000000] // 2G
        for (int i = 0; i < 500000000; i++) {
            dp[i] = 1;
        }
    }
}
`;

export const JavaCE = generateNormalSelfTest("JavaCE", "java", usrCode, {}, [
    {
        type: "direct",
        input,
        output,
        expectResultType: JudgeResultKind.CompileError,
        count: false,
    },
]);
