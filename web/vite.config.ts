import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Dev/preview: browser calls same-origin `/api/*`; Vite forwards to the Express app. */
const apiProxy = {
  "/api": {
    target: "http://127.0.0.1:8080",
    changeOrigin: true
  }
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: apiProxy
  },
  preview: {
    port: 5173,
    host: "0.0.0.0",
    proxy: apiProxy
  }
});
