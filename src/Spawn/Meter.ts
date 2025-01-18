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

export const EmptyMeterResult: MeterResult = {
    memory: 0,
    returnCode: 0,
    signal: -1,
    time: {
        real: 0,
        usr: 0,
        sys: 0,
    },
};

export interface MeteredChildProcess extends ChildProcess {
    result: Promise<MeterResult>;
}
