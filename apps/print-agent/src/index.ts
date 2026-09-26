import { type LabelPrintJob } from "@live-alerts/shared";
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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
import { ShopPrintManager } from "./shopPrintManager.js";
import { loadShopProfiles } from "./shopProfiles.js";
import { loadShopSelection, saveShopSelection } from "./shopSelection.js";
import { createConsoleServer } from "./consoleServer.js";

const warehouseArgument = process.argv
  .find((argument) => argument.startsWith("--warehouse="))
  ?.slice("--warehouse=".length);
const dryRun = process.env.PRINT_AGENT_DRY_RUN === "true";
const writePreview = dryRun || process.env.PRINT_AGENT_WRITE_PREVIEW === "true";
const outputDir = process.env.PRINT_AGENT_OUTPUT_DIR ?? path.join(tmpdir(), "live-alert-labels");
const printScriptPath = path.join(outputDir, "print-rollo-label.ps1");
const pickSequences = new Map<string, PickSequenceTracker>();
const consolePort = Number(process.env.PRINT_AGENT_UI_PORT ?? 3002);
if (!Number.isInteger(consolePort) || consolePort < 1024 || consolePort > 65535) {
  throw new Error("Invalid PRINT_AGENT_UI_PORT");
}
await mkdir(outputDir, { recursive: true });
const profiles = loadShopProfiles(process.env);
const selectionPath = path.join(outputDir, "print-selection.json");
const selection = await loadShopSelection(selectionPath, profiles, process.env, warehouseArgument);
const controller = new ShopPrintManager(profiles, selection, dryRun, printLabel, {
  persist: (selected) => saveShopSelection(selectionPath, selected)
});
const consoleServer = createConsoleServer(controller);
// Bind before connecting/printing: a second agent on this port must not print.
await new Promise<void>((resolve, reject) => {
  consoleServer.once("error", reject);
  consoleServer.listen(consolePort, "127.0.0.1", resolve);
});
log("print console ready", { url: `http://127.0.0.1:${consolePort}/print-control`, dryRun });

await mkdir(outputDir, { recursive: true });
await writePrintScriptIfNeeded();
const printWorker =
  process.platform === "win32" && !dryRun
    ? new WindowsPrintWorker(printScriptPath, (message) => log("print worker error", { message }))
    : undefined;
printWorker?.start();

controller.start();
async function shutdown(): Promise<void> {
  consoleServer.close();
  await controller.stop();
  printWorker?.stop();
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

async function printLabel(job: LabelPrintJob, recovered: boolean): Promise<{ fixed: boolean }> {
  const filePrefix = `rollo-${safeFilePart(shortOrderId(job.orderId))}`;
  const filePath = path.join(outputDir, `${filePrefix}.html`);
  const receivedAt = Date.now();

  if (writePreview) {
    await writeFile(filePath, renderRolloLabelHtml(job), "utf8");
  }

  const pickCode = formatPickCode(job.productName, job.skuName);
  const sequenceKey = `${job.shopId}:${job.storeId}:${job.warehouseId}`;
  const pickSequence = pickSequences.get(sequenceKey) ?? new PickSequenceTracker();
  pickSequences.set(sequenceKey, pickSequence);
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
    return { fixed: recovered || sequence.late };
  }

  await printLabelOnWindows(job, pickCode, recovered || sequence.late);
  log("label sent to default printer", {
    orderId: job.orderId,
    localPrintMs: Date.now() - receivedAt
  });
  return { fixed: recovered || sequence.late };
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
    price:
      job.productPaidAmount === undefined
        ? ""
        : formatProductPaidAmount(job.productPaidAmount, job.productPaidCurrency),
    late
  };

  // A timeout may happen after the spooler accepted the label. Pause for review
  // instead of automatically sending a duplicate physical label.
  await printWorker.print(payload);
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
  console.log(
    JSON.stringify({
      level: "info",
      message,
      time: new Date().toISOString(),
      ...data
    })
  );
}
