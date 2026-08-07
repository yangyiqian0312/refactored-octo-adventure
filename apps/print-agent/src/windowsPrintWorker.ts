import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

export type WindowsPrintPayload = {
  id: string;
  pickCode: string;
  buyerName: string;
  orderId: string;
  price: string;
};

type PendingPrint = {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export class WindowsPrintWorker {
  private child: ChildProcessWithoutNullStreams | undefined;
  private readonly pending = new Map<string, PendingPrint>();

  constructor(
    private readonly scriptPath: string,
    private readonly onError: (message: string) => void = () => undefined
  ) {}

  start(): void {
    if (this.child && !this.child.killed) {
      return;
    }

    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", this.scriptPath],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }
    );
    this.child = child;

    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => this.handleResponse(line));
    child.stderr.on("data", (chunk: Buffer) => this.onError(chunk.toString("utf8").trim()));
    child.on("error", (error) => this.handleExit(error));
    child.on("exit", (code, signal) => {
      this.handleExit(new Error(`Print worker exited (code=${String(code)}, signal=${String(signal)})`));
    });
  }

  async print(payload: WindowsPrintPayload): Promise<void> {
    this.start();
    const child = this.child;

    if (!child || !child.stdin.writable) {
      throw new Error("Print worker is not writable.");
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(payload.id);
        reject(new Error("Print worker response timed out."));
      }, 30_000);

      this.pending.set(payload.id, { resolve, reject, timeout });
      child.stdin.write(`${JSON.stringify(payload)}\n`, "utf8", (error) => {
        if (!error) {
          return;
        }

        const pending = this.pending.get(payload.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pending.delete(payload.id);
          pending.reject(error);
        }
      });
    });
  }

  stop(): void {
    this.child?.stdin.end();
    this.child = undefined;
  }

  private handleResponse(line: string): void {
    try {
      const response = JSON.parse(line) as { id?: unknown; ok?: unknown; error?: unknown };
      if (typeof response.id !== "string") {
        return;
      }

      const pending = this.pending.get(response.id);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timeout);
      this.pending.delete(response.id);

      if (response.ok === true) {
        pending.resolve();
      } else {
        pending.reject(new Error(typeof response.error === "string" ? response.error : "Print failed."));
      }
    } catch {
      this.onError(`Print worker returned an invalid response: ${line}`);
    }
  }

  private handleExit(error: Error): void {
    if (!this.child) {
      return;
    }

    this.child = undefined;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
