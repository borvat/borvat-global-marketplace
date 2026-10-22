import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const app = fileURLToPath(new URL("../../apps/marketplace", import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  envDir: false,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": `${app}/src` }, dedupe: ["react", "react-dom"] },
  server: { host: "127.0.0.1", port: 4178, strictPort: true },
  preview: { host: "127.0.0.1", port: 4178, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});
