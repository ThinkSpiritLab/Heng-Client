import { DynamicFile } from "heng-protocol";
import { getConfig } from "../../Config";

export function getXst(
    input = "main.prj",
    output = "main",
    fpga = getConfig().fpga.package,
    top = "main",
    name = "main.xst"
): DynamicFile {
    return {
        file: {
            content: `run -ifn ${input} -ofn ${output} -p ${fpga} -top ${top}`,
            type: "direct",
        },
        name,
        type: "remote",
    };
}

function getPrjLine(name: string) {
    if (name.endsWith(".v")) {
        return `verilog work ${name}`;
    }
    if (name.endsWith(".vhd")) {
        return `vhdl work ${name}`;
    }
    return "";
}

export function getPrj(
    srcFileName: string,
    files: DynamicFile[] = [],
    name = "main.prj"
): DynamicFile {
    return {
        file: {
            content: files.reduce(
                (content, { name }) => `${content}\n${getPrjLine(name)}`,
                getPrjLine(srcFileName)
            ),
            type: "direct",
        },
        name,
        type: "remote",
    };
}
