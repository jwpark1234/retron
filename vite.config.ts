import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// 앱 버전: package.json의 version (n.n.n, 계정 창에 보인다). 고치면 배포 전에 올린다: 버그 수정 patch, 기능 추가 minor, 크게 바뀌면 major
// npm version patch --no-git-tag-version
const appVersion = () => JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version as string;

export default defineConfig({
  base: "./", // GitHub Pages 하위 경로(/retron/)에서도 동작하도록
  plugins: [preact()],
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
});
