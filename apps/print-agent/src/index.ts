import { labelPrintJobSchema, type LabelPrintJob } from "@live-alerts/shared";
import "dotenv/config";
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
import { WindowsPrintWorker } from "./windowsPrintWorker.js";
import { PickSequenceTracker } from "./pickSequence.js";

const serverUrl = process.env.PRINT_AGENT_SERVER_URL ?? "https://tiktok-shop-live-alert-server.onrender.com";
const token = process.env.PRINT_AGENT_TOKEN ?? process.env.OVERLAY_ALLOWED_TOKEN ?? "otaku-overlay-token";
const dryRun = process.env.PRINT_AGENT_DRY_RUN === "true";
const writePreview = dryRun || process.env.PRINT_AGENT_WRITE_PREVIEW === "true";
const outputDir = process.env.PRINT_AGENT_OUTPUT_DIR ?? path.join(tmpdir(), "live-alert-labels");
const printScriptPath = path.join(outputDir, "print-rollo-label.ps1");
const pickSequence = new PickSequenceTracker();

await mkdir(outputDir, { recursive: true });
await writePrintScriptIfNeeded();
const printWorker = process.platform === "win32" && !dryRun
  ? new WindowsPrintWorker(printScriptPath, (message) => log("print worker error", { message }))
  : undefined;
printWorker?.start();

process.once("SIGINT", () => printWorker?.stop());
process.once("SIGTERM", () => printWorker?.stop());

const socket = io(serverUrl, {
  auth: { token },
  transports: ["websocket", "polling"]
});
let printQueue = Promise.resolve();

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

  const job = parsed.data;
  printQueue = printQueue
    .then(() => printLabel(job))
    .catch((error: unknown) => {
      log("print failed", {
        orderId: job.orderId,
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

  const pickCode = formatPickCode(job.productName, job.skuName);
  const sequence = pickSequence.observe(pickCode);

  log("label generated", {
    orderId: job.orderId,
    pickCode,
    lateSequence: sequence.late,
    ...(writePreview ? { filePath } : {})
  });

  if (sequence.late) {
    log("sequence warning", {
      orderId: job.orderId,
      pickCode,
      previousMax: sequence.previousMax
    });
  }

  if (dryRun) {
    return;
  }

  await printLabelOnWindows(job, pickCode, sequence.late);
  log("label sent to default printer", {
    orderId: job.orderId,
    localPrintMs: Date.now() - receivedAt
  });
}

async function printLabelOnWindows(
  job: LabelPrintJob,
  pickCode: string,
  late: boolean
): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("Automatic printing is currently implemented for Windows only.");
  }

  if (!printWorker) {
    throw new Error("Print worker is unavailable.");
  }

  const payload = {
    id: job.id,
    pickCode,
    buyerName: formatBuyerId(job.buyerNickname),
    orderId: formatShortOrderId(job.orderId),
    price: job.productPaidAmount === undefined
      ? ""
      : formatProductPaidAmount(job.productPaidAmount, job.productPaidCurrency),
    late
  };

  try {
    await printWorker.print(payload);
  } catch (error) {
    log("print worker retry", {
      orderId: job.orderId,
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    await printWorker.print(payload);
  }
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
