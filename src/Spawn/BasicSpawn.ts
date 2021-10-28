import { Stream } from "stream";

export type CompleteStdioOptions = Array<
    "pipe" | "ipc" | "ignore" | "inherit" | Stream | number | null | undefined
>;

// Extract from node/child_process.d.ts
// show which options is used
// options' default value: http://nodejs.cn/api/child_process.html#child_process_child_process_exec_command_options_callback
export interface BasicSpawnOption {
    cwd?: string; // only the deepest layer(now nsjail)
    env?: { [key: string]: string }; // only the deepest layer(now nsjail)
    stdio?: CompleteStdioOptions; // all layer
    uid?: number; // only the deepest layer(now nsjail)
    gid?: number; // only the deepest layer(now nsjail)
}

// export interface BasicChildProcess extends events.EventEmitter {
//     stdin: Writable | null | undefined;
//     stdout: Readable | null;
//     stderr: Readable | null;
//     readonly stdio: [
//         Writable | null | undefined, // stdin
//         Readable | null, // stdout
//         Readable | null, // stderr
//         Readable | Writable | null | undefined, // extra
//         Readable | Writable | null | undefined, // extra
//         Readable | Writable | null | undefined // extra
//     ];
//     readonly killed: boolean;
//     readonly pid: number;
//     readonly exitCode: number | null;
//     readonly signalCode: NodeJS.Signals | null;
//     readonly spawnargs: string[];
//     readonly spawnfile: string;
//     kill(signal?: NodeJS.Signals | number): boolean;

//     /**
//      * events.EventEmitter
//      * 1. error
//      * 2. exit
//      */

//     addListener(event: string, listener: (...args: unknown[]) => void): this;
//     addListener(event: "error", listener: (err: Error) => void): this;
//     addListener(
//         event: "exit",
//         listener: (code: number | null, signal: NodeJS.Signals | null) => void
//     ): this;

//     emit(event: string | symbol, ...args: unknown[]): boolean;
//     emit(event: "error", err: Error): boolean;
//     emit(
//         event: "exit",
//         code: number | null,
//         signal: NodeJS.Signals | null
//     ): boolean;
//     on(event: "error", listener: (err: Error) => void): this;
//     on(
//         event: "exit",
//         listener: (code: number | null, signal: NodeJS.Signals | null) => void
//     ): this;

//     once(event: "error", listener: (err: Error) => void): this;
//     once(
//         event: "exit",
//         listener: (code: number | null, signal: NodeJS.Signals | null) => void
//     ): this;

//     prependListener(event: "error", listener: (err: Error) => void): this;
//     prependListener(
//         event: "exit",
//         listener: (code: number | null, signal: NodeJS.Signals | null) => void
//     ): this;

//     prependOnceListener(
//         event: string,
//         listener: (...args: unknown[]) => void
//     ): this;
//     prependOnceListener(event: "error", listener: (err: Error) => void): this;
//     prependOnceListener(
//         event: "exit",
//         listener: (code: number | null, signal: NodeJS.Signals | null) => void
//     ): this;
// }
