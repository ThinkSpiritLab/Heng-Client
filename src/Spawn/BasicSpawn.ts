import { Stream } from "stream";

export type CompleteStdioOptions = Array<
    "pipe" | "ipc" | "ignore" | "inherit" | Stream | number | null | undefined
>;

// Extract from node/child_process.d.ts
// show which options is used
// options' default value: http://nodejs.cn/api/child_process.html#child_process_child_process_exec_command_options_callback
export interface BasicSpawnOption {
    stdio?: CompleteStdioOptions;
}
