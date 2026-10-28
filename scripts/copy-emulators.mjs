// js-dos 런타임(emulators)을 public/emulators로 복사한다. emulators.js가 wasm을 pathPrefix에서 불러온다.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { unzipSync } from "fflate";

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

// SFC·GBA(Nostalgist.js = RetroArch 웹 빌드)의 코어도 같은 사이트에서 내려준다.
// 기본값은 CDN에서 zip을 받아 매번 푸는데, 버전별 폴더에 풀어 두면 브라우저가 계속 캐시해 둔다.
const RA_VERSION = "v1.22.2"; // nostalgist 0.23.0이 쓰는 빌드
const RA_CORES = ["snes9x", "mgba"]; // src/platforms/retro/systems.ts의 core
const raOut = new URL(`../public/retroarch/${RA_VERSION}/`, import.meta.url);
mkdirSync(raOut, { recursive: true });
for (const core of RA_CORES) {
  if (existsSync(new URL(`${core}_libretro.wasm`, raOut))) continue;
  const res = await fetch(`https://cdn.jsdelivr.net/gh/arianrhodsandlot/retroarch-emscripten-build@${RA_VERSION}/retroarch/${core}_libretro.zip`);
  if (!res.ok) throw new Error(`${core} 코어 받기 실패: ${res.status}`);
  for (const [name, data] of Object.entries(unzipSync(new Uint8Array(await res.arrayBuffer())))) {
    const base = name.split("/").pop();
    if (/\.(js|wasm)$/.test(base)) writeFileSync(new URL(base, raOut), data);
  }
  console.log("RetroArch", core, RA_VERSION);
}

// N64: RetroArch 웹 빌드에는 N64 코어가 없어서 EmulatorJS가 빌드한 parallel_n64를 쓴다 (7z로 묶인 .data를 풀어 둔다).
// EmulatorJS 코어는 RetroArch 명령 대신 자체 함수(simulate_input, save_state_info…)를 내보내서 Nostalgist로는 못 띄운다 → create-ejs.ts
const EJS_VERSION = "4.2.3";
const EJS_CORES = ["parallel_n64"]; // src/platforms/retro/systems.ts의 core (backend: "ejs")
const ejsOut = new URL(`../public/ejs/v${EJS_VERSION}/`, import.meta.url);
mkdirSync(ejsOut, { recursive: true });
for (const core of EJS_CORES) {
  if (existsSync(new URL(`${core}_libretro.wasm`, ejsOut))) continue;
  const res = await fetch(`https://cdn.jsdelivr.net/npm/@emulatorjs/core-${core}@${EJS_VERSION}/${core}-wasm.data`);
  if (!res.ok) throw new Error(`${core} 코어 받기 실패: ${res.status}`);
  const { default: SevenZip } = await import("7z-wasm");
  const sz = await SevenZip({ print: () => undefined, printErr: () => undefined });
  sz.FS.writeFile("/core.7z", new Uint8Array(await res.arrayBuffer()));
  sz.FS.mkdir("/out");
  sz.callMain(["x", "/core.7z", "-o/out", "-y"]);
  for (const f of [`${core}_libretro.js`, `${core}_libretro.wasm`]) writeFileSync(new URL(f, ejsOut), sz.FS.readFile(`/out/${f}`));
  console.log("EmulatorJS", core, EJS_VERSION);
}
