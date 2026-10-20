// 폴더, zip, 낱개 파일에서 게임을 찾아 라이브러리에 등록한다.
// - SFC·GBA: 롬(.sfc/.smc/.fig/.swc, .gba)마다 게임 하나
// - DOS: 실행 파일이 있는 폴더를 C:로, bin/cue나 iso가 있으면 D:(CD)로
// 기기에서는 이렇게 풀어서 쓰고, 드라이브에는 고른 원본(zip, 롬)을 그대로 올린다 (game.source).
// 다른 기기는 원본을 받아 같은 방식으로 다시 푼다 (reimportFiles)
import { CD_DIR, DEFAULT_SETTINGS, HDD_DIR, exeCandidates, findProfile, type DosProfile } from "../platforms/dos/profiles";
import { systemForRom } from "../platforms/retro/systems";
import { convertBinCue, parseCue } from "./cue";
import { gameDir, newGameId, putGame, saveThumbnail, sourceDir, type Game, type GameSource } from "./library";
import { imageFileToSquare, pickIcon } from "./thumbnail";
import { getFile, listFiles, removeDir, writeFile } from "./store";
import { extractZip } from "./zip";

export interface ImportUi {
  progress(msg: string): void;
  /** 실행 파일 후보가 여럿이면 사용자에게 고르게 한다. null이면 취소 */
  chooseExe(candidates: string[]): Promise<string | null>;
  /** 등록은 했지만 알려야 할 것 (게임에 꼭 필요한 파일이 빠짐 등) */
  warn?(msg: string): void;
}

export interface Entry {
  path: string;
  file: File;
}

/**
 * 다시 풀기(드라이브에서 받은 원본을 이 기기에 설치할 때): 처음 추가할 때와 같은 게임 폴더 구조가 나오게 한다.
 * id: 이 폴더에 쓴다 (실패해도 폴더를 지우지 않는다. 받은 원본과 세이브가 들어 있다). pick: 처음에 고른 실행 파일·롬 경로
 */
export interface ReimportOptions {
  id: string;
  pick?: string;
}

type Unpacked = { game: Game; pick: string };

const INCOMING = "_incoming";
const base = (p: string) => p.split("/").pop()!;
const stem = (p: string) => base(p).replace(/\.[^.]+$/, "");
const isZip = (p: string) => /\.zip$/i.test(p);

/**
 * 고른 파일들(zip, 롬, 낱개 파일)을 풀어서 게임으로 등록한다. 게임마다 원본 정보(source)를 적어 둔다.
 * 원본 파일 자체는 여기서 보관하지 않는다. 드라이브 올리기는 이것과 동시에 고른 파일에서 바로 하고,
 * 올리기가 늦거나 실패할 때만 keepSource로 기기에 보관한다 (screens/games/useImport.ts)
 */
export async function importFiles(picked: Entry[], ui: ImportUi): Promise<Game[]> {
  const games = await unpack(picked, ui);
  const out: Game[] = [];
  for (const { game, pick } of games) {
    let source: GameSource;
    if (game.rom && (games.length > 1 || (picked.length === 1 && !isZip(picked[0].path)))) {
      // 롬 하나를 그대로 고른 경우, zip 하나에 롬이 여럿 든 경우: 롬 파일 자체가 원본 (게임마다 하나씩, 원래 이름으로 올린다)
      const rom = await getFile(`${gameDir(game.id)}/${game.rom.rom}`);
      source = { files: [{ name: base(pick), size: rom?.size ?? 0 }], romFile: true };
    } else source = { files: picked.map((e) => ({ name: base(e.path), size: e.file.size })), pick };
    const withSource = { ...game, source };
    await putGame(withSource);
    out.push(withSource);
  }
  return out;
}

/** 원본을 드라이브에 다 올릴 때까지 기기에 보관한다 (games/{id}/source/). 롬 파일이 원본이면 따로 둘 것이 없다 */
export async function keepSource(game: Game, picked: Entry[]) {
  if (!game.source || game.source.romFile) return;
  for (const e of picked) await writeFile(`${sourceDir(game.id)}/${base(e.path)}`, e.file);
}

/** 드라이브에서 받은 원본을 opts.id 폴더에 처음 추가할 때와 같은 모양으로 푼다. 라이브러리에는 넣지 않는다 (부른 쪽이 드라이브 정보와 합쳐 넣는다) */
export async function reimportFiles(picked: Entry[], ui: ImportUi, opts: ReimportOptions): Promise<Game> {
  const [first] = await unpack(picked, ui, opts);
  if (!first) throw new Error("원본에서 게임을 찾지 못했습니다");
  return first.game;
}

async function unpack(picked: Entry[], ui: ImportUi, opts?: ReimportOptions): Promise<Unpacked[]> {
  const entries: Entry[] = [];
  const zips = picked.filter((e) => isZip(e.path));
  // 게임 추가와 드라이브 받기가 같이 돌 수 있어서 부를 때마다 다른 임시 폴더를 쓴다
  const incoming = `${INCOMING}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    for (const [i, zip] of zips.entries()) {
      const out = `${incoming}/${i}`;
      await extractZip(zip.file, out, ui.progress);
      for (const [p, file] of await listFiles(out)) entries.push({ path: `${stem(zip.path)}/${p}`, file });
    }
    for (const e of picked) if (!zips.includes(e)) entries.push(e);
    return await importEntries(entries, ui, zips[0] ? stem(zips[0].path) : undefined, opts);
  } finally {
    await removeDir(incoming);
  }
}

async function importEntries(entries: Entry[], ui: ImportUi, sourceName: string | undefined, opts?: ReimportOptions): Promise<Unpacked[]> {
  let roms = entries.filter((e) => systemForRom(e.path));
  if (opts && roms.length > 1) roms = [roms.find((r) => r.path === opts.pick) ?? roms[0]];
  if (roms.length) return Promise.all(roms.map(async (r) => ({ game: await importRom(r, opts), pick: r.path })));
  const dos = await importDos(entries, ui, sourceName, opts);
  return dos ? [dos] : [];
}

async function importRom(rom: Entry, opts?: ReimportOptions): Promise<Game> {
  const title = stem(rom.path);
  const id = opts?.id ?? newGameId(title);
  const name = `rom.${rom.path.split(".").pop()!.toLowerCase()}`;
  try {
    await writeFile(`${gameDir(id)}/${name}`, rom.file);
  } catch (e) {
    if (!opts) await removeDir(gameDir(id));
    throw e;
  }
  return { id, title, platform: systemForRom(rom.path)!.platform, addedAt: Date.now(), rom: { rom: name } };
}

async function importDos(entries: Entry[], ui: ImportUi, sourceName: string | undefined, opts?: ReimportOptions): Promise<Unpacked | null> {
  const paths = entries.map((e) => e.path);
  const profile = findProfile(paths);
  let exePath: string | null;
  if (profile) {
    exePath = paths.find((p) => base(p).toUpperCase() === profile.entry)!;
    const names = new Set(paths.map((p) => base(p).toUpperCase()));
    const missing = profile.requires?.files.filter((f) => !names.has(f)) ?? [];
    if (missing.length)
      ui.warn?.(`${profile.title}: ${missing.join(", ")} 파일이 없어 ${profile.requires!.breaks} 되지 않습니다 (${profile.requires!.what}). 원래 게임 폴더에 있는 이 파일을 zip에 넣어 다시 추가해 주세요.`);
  } else {
    const candidates = exeCandidates(paths);
    if (!candidates.length) throw new Error("실행할 수 있는 DOS 프로그램(.exe/.com/.bat)이나 SFC ROM을 찾지 못했습니다");
    // 다시 풀 때는 처음에 고른 실행 파일을 그대로 쓴다 (묻지 않는다)
    if (opts) exePath = candidates.find((c) => c === opts.pick) ?? candidates[0];
    else exePath = candidates.length === 1 ? candidates[0] : await ui.chooseExe(candidates);
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
  const id = opts?.id ?? newGameId(title);
  try {
    return { game: await writeDosGame(id, title, entries, exePath, cdFiles, { bin, cueText, isoEntry, profile }, ui), pick: exePath };
  } catch (e) {
    if (!opts) await removeDir(gameDir(id)); // 반쯤 쓴 파일을 남기지 않는다
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

  // 게임 아이콘이 있으면 썸네일로 쓴다 (없으면 첫 실행 때 화면을 캡처한다)
  const paths = entries.map((e) => e.path);
  const icon = profile?.icon ? paths.find((p) => base(p).toUpperCase() === profile.icon) : pickIcon(paths, exePath);
  if (icon) {
    try {
      await saveThumbnail(id, await imageFileToSquare(entries.find((e) => e.path === icon)!.file));
    } catch {
      // 브라우저가 못 읽는 아이콘이면 첫 실행 캡처로 넘어간다
    }
  }

  return {
    id,
    title,
    platform: "dos",
    addedAt: Date.now(),
    dos: { settings: profile?.settings ?? DEFAULT_SETTINGS, exe: base(exePath).toUpperCase(), cd, savePattern: profile?.savePattern },
  };
}
