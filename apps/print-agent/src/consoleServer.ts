import { createServer, type IncomingMessage } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  printConsoleSettingsSchema,
  type PrintConsoleState,
  type LabelPrintJob
} from "@live-alerts/shared";

type ConsoleController = {
  snapshot(): PrintConsoleState;
  settings(settings: {
    profileId?: string | undefined;
    warehouseId?: string | undefined;
    paused?: boolean | undefined;
  }): void | Promise<void>;
  receive(job: LabelPrintJob): void;
};

export function createConsoleServer(controller: ConsoleController) {
  const assetRoot = fileURLToPath(new URL("../../overlay/dist/", import.meta.url));
  const server = createServer(async (request, response) => {
    const address = server.address();
    const host = `127.0.0.1:${address && typeof address !== "string" ? address.port : 0}`;
    const origin = `http://${host}`;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (
      request.headers.host !== host ||
      (request.headers.origin && request.headers.origin !== origin)
    ) {
      response.writeHead(403).end();
      return;
    }
    const send = (status: number, body: unknown) => {
      response
        .writeHead(status, { "Content-Type": "application/json; charset=utf-8" })
        .end(JSON.stringify(body));
    };
    try {
      const pathname = new URL(request.url ?? "/", origin).pathname;
      if (pathname === "/") {
        response.writeHead(302, { Location: "/print-control" }).end();
        return;
      }
      if (request.method === "GET" && pathname === "/api/print-console") {
        send(200, controller.snapshot());
      } else if (request.method === "POST" && pathname.startsWith("/api/")) {
        if (
          request.headers.origin !== origin ||
          request.headers["content-type"] !== "application/json"
        ) {
          send(403, { error: "请从本机打印控制台操作" });
          return;
        }
        if (pathname === "/api/print-console/settings") {
          const parsed = printConsoleSettingsSchema.safeParse(JSON.parse(await readBody(request)));
          if (!parsed.success) {
            send(400, { error: "设置格式无效" });
            return;
          }
          await controller.settings(parsed.data);
          send(200, controller.snapshot());
        } else if (pathname === "/api/print-console/demo" && controller.snapshot().dryRun) {
          const state = controller.snapshot();
          const warehouseId = state.selectedWarehouseId;
          if (!warehouseId) {
            send(400, { error: "请先选择仓库" });
            return;
          }
          controller.receive({
            id: randomUUID(),
            orderId: `demo-${randomUUID()}`,
            storeId: "demo",
            shopId: "demo",
            warehouseId,
            productName: "A Demo pack",
            skuName: "123",
            buyerNickname: "demo",
            createdAt: new Date().toISOString()
          });
          send(200, { ok: true });
        } else send(404, { error: "Not found" });
      } else if (request.method === "GET") {
        const filename =
          pathname === "/" || pathname === "/print-control" ? "index.html" : pathname.slice(1);
        const target = path.resolve(assetRoot, filename);
        if (!target.startsWith(path.resolve(assetRoot) + path.sep)) {
          response.writeHead(404).end();
          return;
        }
        const content = await readFile(target);
        const types: Record<string, string> = {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript",
          ".css": "text/css",
          ".png": "image/png",
          ".svg": "image/svg+xml"
        };
        response
          .writeHead(200, {
            "Content-Type": types[path.extname(target)] ?? "application/octet-stream"
          })
          .end(content);
      } else response.writeHead(405).end();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        send(404, { error: "请先运行 pnpm build 构建界面" });
      else send(400, { error: "操作失败，请检查设置后重试" });
    }
  });
  return server;
}

async function readBody(request: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) {
    body += String(chunk);
    if (body.length > 4096) throw new Error("Request too large");
  }
  return body;
}
