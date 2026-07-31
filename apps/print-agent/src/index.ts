import { labelPrintJobSchema, type LabelPrintJob } from "@live-alerts/shared";
import "dotenv/config";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { io } from "socket.io-client";
import {
  formatBuyerId,
  formatPickCode,
  formatProductPaidAmount,
  formatShortOrderId,
  renderRolloLabelHtml,
  shortOrderId
} from "./label.js";

const serverUrl = process.env.PRINT_AGENT_SERVER_URL ?? "https://tiktok-shop-live-alert-server.onrender.com";
const token = process.env.PRINT_AGENT_TOKEN ?? process.env.OVERLAY_ALLOWED_TOKEN ?? "otaku-overlay-token";
const dryRun = process.env.PRINT_AGENT_DRY_RUN === "true";
const writePreview = dryRun || process.env.PRINT_AGENT_WRITE_PREVIEW === "true";
const outputDir = process.env.PRINT_AGENT_OUTPUT_DIR ?? path.join(tmpdir(), "live-alert-labels");
const printWorkerScriptPath = path.join(outputDir, "print-rollo-label-worker.ps1");
let printWorker: WindowsPrintWorker | undefined;

await mkdir(outputDir, { recursive: true });
await writePrintWorkerScriptIfNeeded();

const socket = io(serverUrl, {
  auth: { token },
  transports: ["websocket", "polling"]
});

socket.on("connect", () => {
  log("connected", { serverUrl, dryRun, writePreview });
});

socket.on("connect_error", (error) => {
  log("connect failed", { message: error.message });
});

socket.on("disconnect", (reason) => {
  log("disconnected", { reason });
});

socket.on("label:print", (payload: unknown) => {
  const parsed = labelPrintJobSchema.safeParse(payload);

  if (!parsed.success) {
    log("ignored invalid print job");
    return;
  }

  void printLabel(parsed.data).catch((error: unknown) => {
    log("print failed", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
  });
});

async function printLabel(job: LabelPrintJob): Promise<void> {
  const filePrefix = `rollo-${safeFilePart(shortOrderId(job.orderId))}`;
  const filePath = path.join(outputDir, `${filePrefix}.html`);
  const receivedAt = Date.now();

  if (writePreview) {
    await writeFile(filePath, renderRolloLabelHtml(job), "utf8");
  }

  log("label generated", {
    orderId: job.orderId,
    ...(writePreview ? { filePath } : {})
  });

  if (dryRun) {
    return;
  }

  await printLabelOnWindows(job);
  log("label sent to default printer", {
    orderId: job.orderId,
    localPrintMs: Date.now() - receivedAt
  });
}

async function printLabelOnWindows(job: LabelPrintJob): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("Automatic printing is currently implemented for Windows only.");
  }

  printWorker ??= new WindowsPrintWorker(printWorkerScriptPath);
  await printWorker.print({
    pickCode: formatPickCode(job.productName, job.skuName),
    buyerNickname: formatBuyerId(job.buyerNickname),
    orderId: formatShortOrderId(job.orderId),
    amountLabel:
      job.productPaidAmount === undefined
        ? ""
        : formatProductPaidAmount(job.productPaidAmount, job.productPaidCurrency)
  });
}

async function writePrintWorkerScriptIfNeeded(): Promise<void> {
  if (process.platform !== "win32") {
    return;
  }

  const script = [
    "Add-Type -AssemblyName System.Drawing;",
    "while (($line = [Console]::In.ReadLine()) -ne $null) {",
    "try {",
    "$job = $line | ConvertFrom-Json;",
    "$pickCode = [string]$job.pickCode;",
    "$buyerNickname = [string]$job.buyerNickname;",
    "$orderId = [string]$job.orderId;",
    "$amountLabel = [string]$job.amountLabel;",
    "$doc = New-Object System.Drawing.Printing.PrintDocument;",
    "$doc.DocumentName = 'Live Order Label';",
    "$doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController;",
    "$doc.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('1.5x1', 100, 150);",
    "$doc.DefaultPageSettings.Landscape = $true;",
    "$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0);",
    "$handler = [System.Drawing.Printing.PrintPageEventHandler]{",
    "param($sender, $event);",
    "$graphics = $event.Graphics;",
    "$graphics.PageUnit = [System.Drawing.GraphicsUnit]::Display;",
    "$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None;",
    "$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit;",
    "$black = [System.Drawing.Brushes]::Black;",
    "$smallFont = New-Object System.Drawing.Font('Arial', 7, [System.Drawing.FontStyle]::Bold);",
    "$orderFont = New-Object System.Drawing.Font('Arial', 5.5, [System.Drawing.FontStyle]::Bold);",
    "$buyerFont = New-Object System.Drawing.Font('Arial', 14, [System.Drawing.FontStyle]::Bold);",
    "$pickCodeFont = New-Object System.Drawing.Font('Arial', 21, [System.Drawing.FontStyle]::Bold);",
    "$noteFont = New-Object System.Drawing.Font('Arial', 5.5, [System.Drawing.FontStyle]::Bold);",
    "$format = New-Object System.Drawing.StringFormat;",
    "$format.Trimming = [System.Drawing.StringTrimming]::EllipsisCharacter;",
    "$format.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap;",
    "$rightFormat = New-Object System.Drawing.StringFormat;",
    "$rightFormat.Alignment = [System.Drawing.StringAlignment]::Far;",
    "$rightFormat.Trimming = [System.Drawing.StringTrimming]::EllipsisCharacter;",
    "$rightFormat.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap;",
    "$graphics.DrawString(('ORDER ' + $orderId), $orderFont, $black, (New-Object System.Drawing.RectangleF(20, 7, 57, 12)), $format);",
    "if ($amountLabel) { $graphics.DrawString($amountLabel, $smallFont, $black, (New-Object System.Drawing.RectangleF(79, 7, 64, 12)), $rightFormat); }",
    "$graphics.DrawLine([System.Drawing.Pens]::Black, 20, 21, 143, 21);",
    "$graphics.DrawString($buyerNickname, $buyerFont, $black, (New-Object System.Drawing.RectangleF(20, 25, 123, 23)), $format);",
    "$graphics.DrawString($pickCode, $pickCodeFont, $black, (New-Object System.Drawing.RectangleF(20, 51, 123, 29)), $format);",
    "$graphics.DrawString('*This label peels off easily.', $noteFont, $black, (New-Object System.Drawing.RectangleF(20, 83, 123, 10)), $format);",
    "$event.HasMorePages = $false;",
    "};",
    "$doc.add_PrintPage($handler);",
    "$doc.Print();",
    "$doc.remove_PrintPage($handler);",
    "$doc.Dispose();",
    "[Console]::Out.WriteLine((@{ id = [string]$job.id; ok = $true } | ConvertTo-Json -Compress));",
    "} catch {",
    "[Console]::Out.WriteLine((@{ id = [string]$job.id; ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress));",
    "}",
    "}"
  ].join("\n");

  await writeFile(printWorkerScriptPath, script, "utf8");
}

type PrintWorkerJob = {
  pickCode: string;
  buyerNickname: string;
  orderId: string;
  amountLabel: string;
};

type PendingPrint = {
  resolve: () => void;
  reject: (error: Error) => void;
};

class WindowsPrintWorker {
  private child: ChildProcessWithoutNullStreams | undefined;
  private stdoutBuffer = "";
  private readonly pending = new Map<string, PendingPrint>();

  constructor(private readonly scriptPath: string) {}

  print(job: PrintWorkerJob): Promise<void> {
    const child = this.ensureStarted();
    const id = randomUUID();

    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ id, ...job })}\n`, "utf8", (error) => {
        if (!error) {
          return;
        }

        this.pending.delete(id);
        reject(error);
      });
    });
  }

  private ensureStarted(): ChildProcessWithoutNullStreams {
    if (this.child && !this.child.killed && this.child.exitCode === null) {
      return this.child;
    }

    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", this.scriptPath],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }
    );

    this.child = child;
    this.stdoutBuffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      this.consumeOutput(chunk);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      log("print worker error output", { message: chunk.trim().slice(0, 500) });
    });
    child.on("error", (error) => {
      this.failPending(error);
    });
    child.on("exit", (code) => {
      this.child = undefined;
      this.failPending(new Error(`Print worker exited with code ${String(code)}.`));
    });

    return child;
  }

  private consumeOutput(chunk: string): void {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      try {
        const result = JSON.parse(line) as { id?: string; ok?: boolean; error?: string };
        const pending = result.id ? this.pending.get(result.id) : undefined;

        if (!result.id || !pending) {
          continue;
        }

        this.pending.delete(result.id);
        if (result.ok) {
          pending.resolve();
        } else {
          pending.reject(new Error(result.error ?? "Print worker failed."));
        }
      } catch {
        log("ignored invalid print worker output");
      }
    }
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }

    this.pending.clear();
  }
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function log(message: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({
    level: "info",
    message,
    time: new Date().toISOString(),
    ...data
  }));
}
