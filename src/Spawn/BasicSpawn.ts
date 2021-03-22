import { Writable, Readable, Stream } from "stream";
import * as events from "events";

export type StdioType = Array<
    "pipe" | "ipc" | "ignore" | "inherit" | Stream | number | null | undefined
>;

export interface BasicSpawnOption {
    cwd?: string;
    env?: { [key: string]: string };
    stdio?: StdioType;
    uid?: number;
    gid?: number;
}

export interface BasicChildProcess extends events.EventEmitter {
    stdin: Writable | null;
    stdout: Readable | null;
    stderr: Readable | null;
    readonly stdio: [
        Writable | null, // stdin
        Readable | null, // stdout
        Readable | null, // stderr
        Readable | Writable | null | undefined, // extra
        Readable | Writable | null | undefined // extra
    ];
    readonly killed: boolean;
    readonly pid: number;
    readonly exitCode: number | null;
    readonly signalCode: NodeJS.Signals | null;
    readonly spawnargs: string[];
    readonly spawnfile: string;
    kill(signal?: NodeJS.Signals | number): boolean;

    /**
     * events.EventEmitter
     * 1. error
     * 2. exit
     */

    addListener(event: string, listener: (...args: unknown[]) => void): this;
    addListener(event: "error", listener: (err: Error) => void): this;
    addListener(
        event: "exit",
        listener: (code: number | null, signal: NodeJS.Signals | null) => void
    ): this;

    emit(event: string | symbol, ...args: unknown[]): boolean;
    emit(event: "error", err: Error): boolean;
    emit(
        event: "exit",
        code: number | null,
        signal: NodeJS.Signals | null
    ): boolean;
    on(event: "error", listener: (err: Error) => void): this;
    on(
        event: "exit",
        listener: (code: number | null, signal: NodeJS.Signals | null) => void
    ): this;

    once(event: "error", listener: (err: Error) => void): this;
    once(
        event: "exit",
        listener: (code: number | null, signal: NodeJS.Signals | null) => void
    ): this;

    prependListener(event: "error", listener: (err: Error) => void): this;
    prependListener(
        event: "exit",
        listener: (code: number | null, signal: NodeJS.Signals | null) => void
    ): this;

    prependOnceListener(
        event: string,
        listener: (...args: unknown[]) => void
    ): this;
    prependOnceListener(event: "error", listener: (err: Error) => void): this;
    prependOnceListener(
        event: "exit",
        listener: (code: number | null, signal: NodeJS.Signals | null) => void
    ): this;
}
