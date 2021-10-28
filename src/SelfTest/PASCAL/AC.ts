import { JudgeResultKind } from "heng-protocol";
import { generateNormalSelfTest } from "../util";

const input = `1 2
`;
const output = `3
`;
const usrCode = `
var a,b,s:longint;
begin
  readln(a,b);
  s:=a+b;
  writeln(s);
end.
`;

export const PascalAC = generateNormalSelfTest(
    "PascalAC",
    "pascal",
    usrCode,
    {},
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
