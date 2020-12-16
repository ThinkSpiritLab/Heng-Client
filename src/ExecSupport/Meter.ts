import { BinExcutable, Result } from "./Excutable";
import { getLogger, Logger } from "log4js";
import { spawn } from "child_process";

export class Meter {
    static meters = new Map<string, Meter>();
    static logger = getLogger("BasicMeter");
    static async exec(type: string, target: BinExcutable): Promise<Result> {
        if (Meter.meters.has(type)) {
            return Meter.meters.get(type).exec(target);
        } else {
            this.logger.fatal(`Unknow Meter ${type}`);
            throw `Unknow Meter ${type}`;
        }
    }
    constructor(
        name: string,
        exec: (self: Meter, target: BinExcutable) => Promise<Result>
    ) {
        if (Meter.meters.has(name)) {
            Meter.logger.fatal(`Meter ${name} Exists`);
            throw `Meter ${name} Exists`;
        } else {
            this.name = name;
            this.logger = getLogger(`Metet-${name}`);
            this.excuter = exec;
            Meter.meters.set(name, this);
        }
    }
    name: string;
    logger: Logger;
    excuter: (self: Meter, target: BinExcutable) => Promise<Result>;
    exec(target: BinExcutable) {
        return this.excuter(this, target);
    }
}
export const HcMeter = new Meter("hc", (self: Meter, target: BinExcutable) => {
    return new Promise<Result>((resolve, reject) => {
        const args = new Array<string>();
        const childProcess = spawn("hc", args);
    });
});
