import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `1 2
`;
const output = `3
`;
const usrCode = `
public class Main {
    public static void main(String[] args) {
        int dp[] = new int[5000]; // 2G
        for (int i = 0; i < 500000000; i++) {
            dp[i] = 1;
        }
    }
}
`;

export const JavaRE = generateNormalSelfTest("JavaRE", "java", usrCode, {}, [
    {
        type: "direct",
        input,
        output,
        expectResultType: JudgeResultKind.RuntimeError,
        count: false,
    },
]);
