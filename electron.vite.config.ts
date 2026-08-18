import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "apps/desktop/src/main/index.ts")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "apps/desktop/src/preload/index.ts")
      }
    }
  },
  renderer: {
    root: resolve(__dirname, "apps/desktop/src/renderer"),
    server: {
      fs: {
        allow: [resolve(__dirname)]
      }
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, "apps/desktop/src/renderer/index.html")
      }
    },
    plugins: [react()]
  }
});
