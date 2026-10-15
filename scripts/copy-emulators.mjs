// js-dos 런타임(emulators)을 public/emulators로 복사한다. emulators.js가 wasm을 pathPrefix에서 불러온다.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const src = new URL("../node_modules/emulators/dist/", import.meta.url);
const out = new URL("../public/emulators/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const f of ["emulators.js", "wdosbox-x.js", "wdosbox-x.wasm", "wlibzip.js", "wlibzip.wasm"]) cpSync(new URL(f, src), new URL(f, out));

// 워커가 받은 파일을 메모리 FS에 쓸 때 한 벌 더 복사하지 않게 한다 (큰 CD 이미지에서 메모리가 모자라지 않도록)
const worker = new URL("wdosbox-x.js", out);
const FROM = 'Module.FS.writeFile(path+"/"+filename,body)';
const code = readFileSync(worker, "utf8");
if (!code.includes(FROM)) throw new Error("wdosbox-x.js가 바뀌었습니다: FS.writeFile 패치를 확인하세요");
writeFileSync(worker, code.replace(FROM, 'Module.FS.writeFile(path+"/"+filename,body,{canOwn:true})'));

// SFC(EmulatorJS)도 같은 사이트에서 내려준다. CDN에서 매번 받으면 코어 캐시 확인(report)이 실패할 때마다
// 코어를 처음부터 다시 받는다. 버전별 폴더라 한 번 받으면 브라우저가 계속 캐시해 둔다.
const EJS_VERSION = "4.2.3";
const EJS_FILES = [
  "loader.js", "emulator.min.js", "emulator.min.css",
  "compression/extract7z.js", "compression/extractzip.js", "compression/libunrar.js", "compression/libunrar.wasm",
  "cores/snes9x-wasm.data", "cores/snes9x-legacy-wasm.data", "cores/reports/snes9x.json",
];
const ejsOut = new URL(`../public/ejs/${EJS_VERSION}/`, import.meta.url);
for (const f of EJS_FILES) {
  const dest = new URL(f, ejsOut);
  if (existsSync(dest)) continue;
  const res = await fetch(`https://cdn.emulatorjs.org/${EJS_VERSION}/data/${f}`);
  if (!res.ok) throw new Error(`EmulatorJS ${f} 받기 실패: ${res.status}`);
  mkdirSync(new URL(".", dest), { recursive: true });
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log("EmulatorJS", f);
}
