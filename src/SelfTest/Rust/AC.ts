import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `1 2
`;
const output = `3
`;
const usrCode = `
use std::io::BufRead;

fn main() -> std::io::Result<()> {
    for line in std::io::stdin().lock().lines() {
        let ans: i32 = line?.split(' ').map(|s| s.parse::<i32>().unwrap()).sum();
        println!("{}", ans);
    }
    Ok(())
}
`;

export const RustAC = generateNormalSelfTest("RustAC", "rust", usrCode, {}, [
    {
        type: "direct",
        input,
        output,
        expectResultType: JudgeResultKind.Accepted,
        count: false,
    },
]);
