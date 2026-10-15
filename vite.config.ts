import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  base: "./", // GitHub Pages 하위 경로(/retron/)에서도 동작하도록
  plugins: [preact()],
});
