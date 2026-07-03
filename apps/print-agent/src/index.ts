import { labelPrintJobSchema, type LabelPrintJob } from "@live-alerts/shared";
import "dotenv/config";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { io } from "socket.io-client";
import { renderRolloLabelHtml, shortOrderId } from "./label.js";

const serverUrl = process.env.PRINT_AGENT_SERVER_URL ?? "https://tiktok-shop-live-alert-server.onrender.com";
const token = process.env.PRINT_AGENT_TOKEN ?? process.env.OVERLAY_ALLOWED_TOKEN ?? "otaku-overlay-token";
const dryRun = process.env.PRINT_AGENT_DRY_RUN === "true";
const outputDir = process.env.PRINT_AGENT_OUTPUT_DIR ?? path.join(tmpdir(), "live-alert-labels");

await mkdir(outputDir, { recursive: true });

const socket = io(serverUrl, {
  auth: { token },
  transports: ["websocket", "polling"]
});

socket.on("connect", () => {
  log("connected", { serverUrl, dryRun });
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
  const filePath = path.join(outputDir, `rollo-${safeFilePart(shortOrderId(job.orderId))}.html`);

  await writeFile(filePath, renderRolloLabelHtml(job), "utf8");
  log("label generated", {
    buyerDisplayName: job.buyerDisplayName,
    orderId: job.orderId,
    filePath
  });

  if (dryRun) {
    return;
  }

  await printHtmlOnWindows(filePath);
  log("label sent to default printer", { orderId: job.orderId });
}

async function printHtmlOnWindows(filePath: string): Promise<void> {
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
        "-Command",
        "Start-Process -FilePath $args[0] -Verb Print -WindowStyle Hidden",
        filePath
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
