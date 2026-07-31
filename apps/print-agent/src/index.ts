import { labelPrintJobSchema, type LabelPrintJob } from "@live-alerts/shared";
import "dotenv/config";
import { execFile } from "node:child_process";
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
import { renderWindowsPrintScript } from "./windowsPrintScript.js";

const serverUrl = process.env.PRINT_AGENT_SERVER_URL ?? "https://tiktok-shop-live-alert-server.onrender.com";
const token = process.env.PRINT_AGENT_TOKEN ?? process.env.OVERLAY_ALLOWED_TOKEN ?? "otaku-overlay-token";
const dryRun = process.env.PRINT_AGENT_DRY_RUN === "true";
const writePreview = dryRun || process.env.PRINT_AGENT_WRITE_PREVIEW === "true";
const outputDir = process.env.PRINT_AGENT_OUTPUT_DIR ?? path.join(tmpdir(), "live-alert-labels");
const printScriptPath = path.join(outputDir, "print-rollo-label.ps1");

await mkdir(outputDir, { recursive: true });
await writePrintScriptIfNeeded();

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

  await new Promise<void>((resolve, reject) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        printScriptPath,
        formatPickCode(job.productName, job.skuName),
        formatBuyerId(job.buyerNickname),
        formatShortOrderId(job.orderId),
        job.productPaidAmount === undefined
          ? ""
          : formatProductPaidAmount(job.productPaidAmount, job.productPaidCurrency)
      ],
      { windowsHide: true },
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      }
    );
  });
}

async function writePrintScriptIfNeeded(): Promise<void> {
  if (process.platform !== "win32") {
    return;
  }

  await writeFile(printScriptPath, renderWindowsPrintScript(), "utf8");
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
