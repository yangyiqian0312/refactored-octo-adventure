import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createConsoleServer } from "./consoleServer.js";
import { PrintController } from "./printController.js";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        })
    )
  );
});

describe("local console access", () => {
  it("rejects foreign origins/hosts, validates settings, and disables demo printing in live mode", async () => {
    const controller = new PrintController(false, "", async () => undefined);
    controller.context({ warehouses: [{ id: "a", name: "A" }], paymentHolds: [] });
    const server = createConsoleServer(controller);
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No listener");
    const url = `http://127.0.0.1:${address.port}`;
    const headers = { origin: url, "content-type": "application/json" };
    expect((await fetch(`${url}/api/print-console`)).status).toBe(200);
    expect(
      (
        await fetch(`${url}/api/print-console`, {
          headers: { ...headers, origin: "https://foreign.example" }
        })
      ).status
    ).toBe(403);
    expect(
      (
        await fetch(`${url}/api/print-console/settings`, {
          method: "POST",
          headers,
          body: '{"warehouseId":"unknown"}'
        })
      ).status
    ).toBe(400);
    expect(
      (
        await fetch(`${url}/api/print-console/settings`, {
          method: "POST",
          headers,
          body: '{"warehouseId":"a"}'
        })
      ).status
    ).toBe(200);
    expect(controller.snapshot().selectedWarehouseId).toBe("a");
    expect(
      (await fetch(`${url}/api/print-console/demo`, { method: "POST", headers, body: "{}" })).status
    ).toBe(404);
  });
});
