import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  build: {
    target: "es2022", // sfc-page.ts가 top-level await를 쓴다
    rollupOptions: { input: { main: "index.html", sfc: "sfc.html" } },
  },
});
