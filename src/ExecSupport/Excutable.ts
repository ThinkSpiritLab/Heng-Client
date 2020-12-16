import { Queue } from "queue-typescript";

export type FilePath = string;

export interface BasicExcutable {
    fd: {
        stdin: FilePath;
        stdout: FilePath;
        stderr: FilePath;
        [key: number]: FilePath;
    };
    cwd: FilePath;
    uid?: number;
    gid?: number;

    args: string[];
}

export interface BinExcutable extends BasicExcutable {
    bin: FilePath;
}

export interface Result {
    exitCode: number;
    signal: number;
    time: number;
    mem: number;
}

class Task {
    target: BinExcutable;
    resolve: (result: Result) => void;
    reject: (reason: any) => void;
}

export class Excuter {
    public async exec(target: BinExcutable): Promise<Result> {
        return new Promise((resolve, reject) => {});
    }
}

export class QueuedExcuter extends Excuter {
    limit: number;
    running: number;
    queue: Queue<Task>;
    hcPath: string;
    constructor(limit: number) {
        super();
        this.limit = limit;
        this.running = 0;
        this.queue = new Queue<Task>();
    }

    public async exec(target: BinExcutable): Promise<Result> {
        return new Promise(async (resolve, reject) => {
            this.queue.enqueue({ target, resolve, reject });
            while (this.queue.length !== 0) {
                const topTask = this.queue.dequeue();
                try {
                    const res = await super.exec(topTask.target);
                    topTask.resolve(res);
                } catch (e) {
                    topTask.reject(e);
                }
            }
        });
    }
}
