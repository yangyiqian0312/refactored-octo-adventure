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
  const filePrefix = `rollo-${safeFilePart(shortOrderId(job.orderId))}`;
  const filePath = path.join(outputDir, `${filePrefix}.html`);

  await writeFile(filePath, renderRolloLabelHtml(job), "utf8");
  log("label generated", {
    orderId: job.orderId,
    filePath
  });

  if (dryRun) {
    return;
  }

  await printLabelOnWindows(job);
  log("label sent to default printer", { orderId: job.orderId });
}

async function printLabelOnWindows(job: LabelPrintJob): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("Automatic printing is currently implemented for Windows only.");
  }

  const script = [
    "param([string]$skuName, [string]$productName, [string]$buyerNickname, [string]$orderId)",
    "Add-Type -AssemblyName System.Drawing;",
    "$doc = New-Object System.Drawing.Printing.PrintDocument;",
    "$doc.DocumentName = 'Live Order Label';",
    "$doc.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('2x1', 100, 200);",
    "$doc.DefaultPageSettings.Landscape = $true;",
    "$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0);",
    "$doc.add_PrintPage({",
    "param($sender, $event);",
    "$graphics = $event.Graphics;",
    "$graphics.PageUnit = [System.Drawing.GraphicsUnit]::Display;",
    "$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None;",
    "$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit;",
    "$black = [System.Drawing.Brushes]::Black;",
    "$smallFont = New-Object System.Drawing.Font('Arial', 7, [System.Drawing.FontStyle]::Bold);",
    "$productFont = New-Object System.Drawing.Font('Arial', 8, [System.Drawing.FontStyle]::Bold);",
    "$orderFont = New-Object System.Drawing.Font('Arial', 14, [System.Drawing.FontStyle]::Bold);",
    "$format = New-Object System.Drawing.StringFormat;",
    "$format.Trimming = [System.Drawing.StringTrimming]::EllipsisCharacter;",
    "$format.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap;",
    "$graphics.DrawString($orderId, $smallFont, $black, (New-Object System.Drawing.RectangleF(8, 8, 184, 13)), $format);",
    "$graphics.DrawString(('BUYER ' + $buyerNickname), $smallFont, $black, (New-Object System.Drawing.RectangleF(8, 24, 184, 13)), $format);",
    "$graphics.DrawString($productName, $productFont, $black, (New-Object System.Drawing.RectangleF(8, 40, 184, 16)), $format);",
    "$graphics.DrawString(('#' + $skuName), $orderFont, $black, (New-Object System.Drawing.RectangleF(8, 62, 184, 24)), $format);",
    "$event.HasMorePages = $false;",
    "});",
    "$doc.Print();"
  ].join("\n");
  const scriptPath = path.join(outputDir, "print-rollo-label.ps1");

  await writeFile(scriptPath, script, "utf8");

  await new Promise<void>((resolve, reject) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        job.skuName,
        job.productName,
        job.buyerNickname,
        job.orderId,
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
