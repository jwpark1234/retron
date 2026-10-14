// 폴더, zip, 낱개 파일에서 게임을 찾아 라이브러리에 등록한다.
// - SFC: .sfc/.smc/.fig/.swc ROM마다 게임 하나
// - DOS: 실행 파일이 있는 폴더를 C:로, bin/cue나 iso가 있으면 D:(CD)로
import { CD_DIR, DEFAULT_SETTINGS, HDD_DIR, buildConf, exeCandidates, findProfile, type DosProfile } from "../platforms/dos/profiles";
import { convertBinCue, parseCue } from "./cue";
import { gameDir, newGameId, putGame, type Game } from "./library";
import { listFiles, removeDir, writeFile } from "./store";
import { extractZip } from "./zip";

export interface ImportUi {
  progress(msg: string): void;
  /** 실행 파일 후보가 여럿이면 사용자에게 고르게 한다. null이면 취소 */
  chooseExe(candidates: string[]): Promise<string | null>;
}

interface Entry {
  path: string;
  file: File;
}

const INCOMING = "_incoming";
const ROM = /\.(sfc|smc|fig|swc)$/i;
const base = (p: string) => p.split("/").pop()!;
const stem = (p: string) => base(p).replace(/\.[^.]+$/, "");

/** input[type=file]에서 고른 파일들 (폴더 선택이면 webkitRelativePath가 있다) */
export async function importFiles(files: File[], ui: ImportUi): Promise<Game[]> {
  const entries: Entry[] = [];
  const zips = files.filter((f) => /\.zip$/i.test(f.name));
  try {
    for (const [i, zip] of zips.entries()) {
      const out = `${INCOMING}/${i}`;
      await extractZip(zip, out, ui.progress);
      for (const [p, file] of await listFiles(out)) entries.push({ path: `${stem(zip.name)}/${p}`, file });
    }
    for (const f of files) if (!zips.includes(f)) entries.push({ path: f.webkitRelativePath || f.name, file: f });
    return await importEntries(entries, ui, zips[0] ? stem(zips[0].name) : undefined);
  } finally {
    await removeDir(INCOMING);
  }
}

async function importEntries(entries: Entry[], ui: ImportUi, sourceName?: string): Promise<Game[]> {
  const roms = entries.filter((e) => ROM.test(e.path));
  if (roms.length) return Promise.all(roms.map((r) => importSfc(r)));
  const game = await importDos(entries, ui, sourceName);
  return game ? [game] : [];
}

async function importSfc(rom: Entry): Promise<Game> {
  const title = stem(rom.path);
  const id = newGameId(title);
  const name = `rom.${rom.path.split(".").pop()!.toLowerCase()}`;
  await writeFile(`${gameDir(id)}/${name}`, rom.file);
  const game: Game = { id, title, platform: "sfc", addedAt: Date.now(), sfc: { rom: name } };
  await putGame(game);
  return game;
}

async function importDos(entries: Entry[], ui: ImportUi, sourceName?: string): Promise<Game | null> {
  const paths = entries.map((e) => e.path);
  const profile = findProfile(paths);
  let exePath: string | null;
  if (profile) {
    exePath = paths.find((p) => base(p).toUpperCase() === profile.entry)!;
  } else {
    const candidates = exeCandidates(paths);
    if (!candidates.length) throw new Error("실행할 수 있는 DOS 프로그램(.exe/.com/.bat)이나 SFC ROM을 찾지 못했습니다");
    exePath = candidates.length === 1 ? candidates[0] : await ui.chooseExe(candidates);
    if (!exePath) return null;
  }

  // CD 이미지: bin/cue 우선, 없으면 iso
  const cueEntry = entries.find((e) => /\.cue$/i.test(e.path));
  const isoEntry = entries.find((e) => /\.iso$/i.test(e.path));
  const cdFiles = new Set<Entry>();
  let bin: Entry | undefined;
  let cueText = "";
  if (cueEntry) {
    cueText = await cueEntry.file.text();
    const binName = base(parseCue(cueText).bin).toLowerCase();
    bin = entries.find((e) => base(e.path).toLowerCase() === binName);
    if (!bin) throw new Error(`CUE가 가리키는 ${binName} 파일이 없습니다`);
    cdFiles.add(cueEntry).add(bin);
  } else if (isoEntry) cdFiles.add(isoEntry);

  const title = profile?.title ?? (sourceName || exePath.split("/").slice(-2, -1)[0] || stem(exePath));
  const id = newGameId(title);
  try {
    return await writeDosGame(id, title, entries, exePath, cdFiles, { bin, cueText, isoEntry, profile }, ui);
  } catch (e) {
    await removeDir(gameDir(id)); // 반쯤 쓴 파일을 남기지 않는다
    throw e;
  }
}

async function writeDosGame(
  id: string,
  title: string,
  entries: Entry[],
  exePath: string,
  cdFiles: Set<Entry>,
  { bin, cueText, isoEntry, profile }: { bin?: Entry; cueText: string; isoEntry?: Entry; profile?: DosProfile },
  ui: ImportUi,
): Promise<Game> {
  const root = exePath.slice(0, exePath.length - base(exePath).length);
  const hdd = entries.filter((e) => e.path.startsWith(root) && !cdFiles.has(e));
  for (const [i, e] of hdd.entries()) {
    ui.progress(`게임 파일 복사 중 ${i + 1}/${hdd.length}`);
    await writeFile(`${gameDir(id)}/${HDD_DIR}/${e.path.slice(root.length).toUpperCase()}`, e.file);
  }

  let cd: string | undefined;
  if (bin) {
    cd = "CD.CUE";
    await convertBinCue(cueText, bin.file, `${gameDir(id)}/${CD_DIR}`, cd, ui.progress);
  } else if (isoEntry) {
    cd = "CD.ISO";
    ui.progress("CD 이미지 복사 중");
    await writeFile(`${gameDir(id)}/${CD_DIR}/${cd}`, isoEntry.file);
  }

  const game: Game = {
    id,
    title,
    platform: "dos",
    addedAt: Date.now(),
    dos: { conf: buildConf(profile?.settings ?? DEFAULT_SETTINGS, base(exePath).toUpperCase(), cd), savePattern: profile?.savePattern },
  };
  await putGame(game);
  return game;
}
