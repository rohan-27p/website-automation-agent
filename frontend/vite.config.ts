import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev server proxies API + SSE calls to the backend so the browser can use
// same-origin relative URLs (/api/...).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
