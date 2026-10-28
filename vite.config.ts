import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// 앱 버전: 빌드한 날짜 + 커밋 (계정 창에 보인다). 커밋하지 않은 수정이 들어갔으면 커밋 뒤에 * 를 붙인다
function appVersion() {
  const d = new Date();
  const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  try {
    const hash = execSync("git rev-parse --short HEAD").toString().trim();
    const dirty = execSync("git status --porcelain --untracked-files=no").toString().trim() ? "*" : "";
    return `${date} · ${hash}${dirty}`;
  } catch {
    return date; // git이 없는 곳에서 빌드
  }
}

export default defineConfig({
  base: "./", // GitHub Pages 하위 경로(/retron/)에서도 동작하도록
  plugins: [preact()],
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
});
