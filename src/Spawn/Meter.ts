import { ChildProcess } from "child_process";

export interface MeterResult {
    memory: number; // bytes
    returnCode: number;
    signal: number;
    time: {
        real: number; // ms
        sys: number; // ms
        usr: number; // ms
    };
}

export interface MeteredChildProcess extends ChildProcess {
    result: Promise<MeterResult>;
}
