import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { createApp } from "./server.js";

const config = loadConfig();
const { app } = await createApp(config);

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  logger.info("server listening", { port: config.port });
} catch (error) {
  logger.error("server failed to start", {
    errorName: error instanceof Error ? error.name : "UnknownError"
  });
  process.exit(1);
}
