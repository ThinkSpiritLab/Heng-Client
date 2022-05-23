import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `1 2
`;
const output = `3
`;
const usrCode = `
const fs = require('fs');
const data = fs.readFileSync('/dev/stdin');
const result = data.toString('ascii').trim().split(' ').map(x => parseInt(x)).reduce((a, b) => a + b, 0);
console.log(result);
// let raw = "";
// process.stdin.on("data", function (chunk) {
//     if (chunk) {
//         raw += chunk.toString();
//     }
// });
// process.stdin.on("end", function () {
//     let lines = raw.split("\\n");
//     const arr = lines[0].split(" ");
//     console.log(+arr[0] + +arr[1]);
// });
`;

export const JsAC = generateNormalSelfTest("JsAC", "js", usrCode, {}, [
    {
        type: "direct",
        input,
        output,
        expectResultType: JudgeResultKind.Accepted,
        count: false,
    },
]);
