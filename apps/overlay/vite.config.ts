import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(dirname, "../..");

export default defineConfig({
  plugins: [react()],
  cacheDir: path.resolve(workspaceRoot, "node_modules/.vite/overlay"),
  server: {
    fs: {
      allow: [workspaceRoot]
    }
  }
});
