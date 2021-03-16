export class Throttle {
    private used = 0;
    private queue: (() => void)[] = [];
    constructor(readonly capablity: number) {}
    async withThrottle<T>(
        fn: () => Promise<T>
    ): Promise<T> {
        if (this.used >= this.capablity) {
            await this.block();
        }
        try {
            ++this.used;
            const t = await fn();
            return t;
        } finally {
            --this.used;
            this.next();
        }
    }
    block() {
        return new Promise<void>((resolve) => this.queue.push(() => resolve()));
    }
    next() {
        if (this.queue.length > 0) {
            const f = this.queue.shift();
            if (f !== undefined) f();
        }
    }
}
