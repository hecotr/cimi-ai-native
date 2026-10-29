import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Emitted into the workbench server's dist/web; the Node server preloads and serves it.
export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "../workbench/dist/web",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0
  }
});
