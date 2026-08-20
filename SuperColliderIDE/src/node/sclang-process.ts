import { ChildProcess, spawn } from "child_process";
import { StringDecoder } from "string_decoder";
// import { StringDecoder } from "string_decoder";

export const EVALUATE = 0x0c;
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

        this.process.on('error', err => this.onPost(`[sclang] failed to start: ${err.message}\n`));
        this.process.on('exit', code => {this.process = undefined; this.onExit(code);});

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

    kill(): void {
        this.process?.kill('SIGTERM');
        this.process = undefined;
    }
    
    get pid(): number | undefined { return this.process?.pid; }
}
