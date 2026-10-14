// js-dos 런타임(emulators)을 public/emulators로 복사한다. emulators.js가 wasm을 pathPrefix에서 불러온다.
import { cpSync, mkdirSync } from "node:fs";

const src = new URL("../node_modules/emulators/dist/", import.meta.url);
const out = new URL("../public/emulators/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const f of ["emulators.js", "wdosbox-x.js", "wdosbox-x.wasm", "wlibzip.js", "wlibzip.wasm"]) cpSync(new URL(f, src), new URL(f, out));
