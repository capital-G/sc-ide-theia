import { ChildProcess, spawn } from "child_process";
import { StringDecoder } from "string_decoder";

export const EVALUATE = 0x0c;
export const SILENT = 0x1b;
export const RECOMPILE = 0x18;

export interface SclangOptions {
    sclangPath: string,
    cwd?: string;
    ideName?: string; // -i - default to theai for now^^
    arguments?: string[];
}

/**
 * A wrapper for our sclang process b/c we need to use child process
 * in order to write raw bytes such as EVALUATE or RECOMPILE into the stdin.
 */
export class SclangProcess {
    protected process: ChildProcess | undefined;
    protected exited = false;

    constructor(
        protected readonly options: SclangOptions,
        protected readonly onPost: (chunk: string) => void,
        protected readonly onExit: (code: number | null) => void,
    ) {}

    start(): void {
        const args = [
            "-i", this.options.ideName ?? "theia",
            ...(this.options.arguments ?? [])
        ];
        this.process = spawn(
            this.options.sclangPath,
            args,
            {
                cwd: this.options.cwd ?? process.env.HOME,
                env: process.env,
            }
        );

        // When the spawn itself fails (e.g. a wrong sclangPath) node emits 'error' and
        // 'close' but never 'exit' - so both paths have to end in onExit, otherwise the
        // owner keeps a handle to a process that never existed and can never restart it.
        this.process.on('error', err => {
            this.onPost(`[sclang] failed to start: ${err.message}\n`);
            this.handleExit(null);
        });
        this.process.on('exit', code => this.handleExit(code));

        // use a custom string decoder
        const out = new StringDecoder('utf8');
        this.process.stdout?.on('data', (buf: Buffer) => this.onPost(out.write(buf)));
        const err = new StringDecoder('utf8');
        this.process.stderr?.on('data', (buf: Buffer) => this.onPost(err.write(buf)));
    }

    /**
     * 
     * @param code Code to be evaluated
     * @param controlByte determines e.g. if sclang should interpret or recompile
     * @returns void
     */
    write(code: string, controlByte: number): void {
        const stdin = this.process?.stdin;
        if(!stdin) { return; };
        stdin.write(code);
        stdin.write(Buffer.from([controlByte]));
    }

    /** Reports the exit exactly once, no matter which event got us here. */
    protected handleExit(code: number | null): void {
        if (this.exited) { return; }
        this.exited = true;
        this.process = undefined;
        this.onExit(code);
    }

    kill(): void {
        // no clearing of the handle here - 'exit' does that, so the owner still gets notified
        this.process?.kill('SIGTERM');
    }
    
    get pid(): number | undefined { return this.process?.pid; }
}
