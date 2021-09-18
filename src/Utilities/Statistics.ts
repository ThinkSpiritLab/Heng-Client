import { StatusReport } from "heng-protocol";
import os from "os";

class Statistics {
    private total = 0;
    private finished = 0;
    private count: number[] = [0, 0, 0];
    private stateMap = new Map<string, number>();
    private readonly length = 3;

    tick(id: string) {
        let level = this.stateMap.get(id);
        if (level === undefined) {
            this.total++;
            level = 0;
            this.count[level]++;
            this.stateMap.set(id, level);
        } else {
            this.count[level]--;
            level++;
            if (level >= this.length) {
                this.stateMap.delete(id);
                this.finished++;
                return;
            }
            this.count[level]++;
            this.stateMap.set(id, level);
        }
    }

    finish(id: string) {
        const level = this.stateMap.get(id);
        if (level !== undefined) {
            this.count[level]--;
            this.stateMap.delete(id);
            this.finished++;
        }
    }

    collect(): StatusReport {
        return {
            hardware: {
                cpu: { percentage: os.loadavg()[0] / os.cpus().length },
                memory: { percentage: 1 - os.freemem() / os.totalmem() },
            },
            judge: {
                pending: this.count[0],
                preparing: {
                    downloading: 0,
                    readingCache: 0,
                    compiling: this.count[1],
                },
                judging: this.count[2],
                finished: this.finished,
                total: this.total,
            },
        };
    }
}

export const stat = new Statistics();
