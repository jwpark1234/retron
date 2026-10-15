import { useEffect, useRef, useState } from "preact/hooks";
import type { CommandInterface } from "emulators";
import { gameDir, type Game } from "../../library/library";
import { listFiles, removeFile, writeFile, type FileMap } from "../../library/store";
import { GameMenu, type StateBridge } from "../../ui/GameMenu";
import { hasThumbnail, litFractionOf, saveFirstRunThumbnail, squarePng } from "../../library/thumbnail";
import { uploadGame } from "../../cloud/games";
import { rotatedStyle } from "../../ui/RotatedStage";
import { toLocal, useOrientation } from "../../ui/orientation";
import { effectiveVolume, setPrefs, usePrefs, type PadSide } from "../../ui/prefs";
import { Trackpad } from "../../ui/Trackpad";
import { VirtualKeys } from "../../ui/VirtualKeys";
import { markDirty } from "../../sync/sync";
import { attachAudio, attachVideo, createDos, loadDosState, saveDosState, toDosKey } from "./create-dos";
import { watchGamepad } from "./gamepad";
import { CD_DIR, HDD_DIR, buildConf, withCycles } from "./profiles";
import { watchSaves } from "./save-watch";

const MIN_PRESS_MS = 80;
const KEYS = [
  { label: "ESC", key: 256 },
  { label: "Enter", key: 257 },
  { label: "Space", key: 32 },
  { label: "Y", key: 89 },
  { label: "N", key: 78 },
];
const isUi = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest(".vbar, .menu-button, .menu-backdrop");
const touchDevice = matchMedia("(pointer: coarse)").matches;
const PAD_SIDES: { side: PadSide; label: string }[] = [
  { side: "left", label: "왼쪽" },
  { side: "right", label: "오른쪽" },
];

export function DosPlayer({ game, onExit }: { game: Game; onExit: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ci = useRef<CommandInterface | null>(null);
  const [status, setStatus] = useState("불러오는 중…");
  const [toast, setToast] = useState("");
  const [bridge, setBridge] = useState<StateBridge | null>(null);
  const dir = gameDir(game.id);
  const orientation = useOrientation();
  const rotation = useRef(0);
  rotation.current = orientation.rotation;
  const prefs = usePrefs();
  const volume = useRef<(v: number) => void>(() => {});
  const cursor = useRef({ x: 0.5, y: 0.5 }); // 마우스·패드가 같이 쓰는 커서 위치
  const remap = game.dos!.input?.keys ?? {};

  useEffect(() => volume.current(effectiveVolume(prefs)), [prefs.volume, prefs.muted]);

  const snapshot = () => new Promise<Blob | null>((resolve) => (canvas.current ? canvas.current.toBlob(resolve, "image/png") : resolve(null)));
  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];
    (async () => {
      // 파일 내용은 createDos가 필요한 만큼만 읽는다
      const files = new Map<string, File>();
      for (const [p, f] of await listFiles(`${dir}/${HDD_DIR}`)) files.set(`${HDD_DIR}/${p}`, f);
      const saves = await listFiles(`${dir}/saves`);
      for (const [p, f] of saves) files.set(`${HDD_DIR}/${p}`, f); // 세이브를 원본 위에 덮는다
      for (const [p, f] of await listFiles(`${dir}/${CD_DIR}`)) files.set(`${CD_DIR}/${p}`, f);
      setStatus("에뮬레이터 시작 중…");
      const info = game.dos!;
      const dos = await createDos(files, buildConf(withCycles(info.settings, info.cycles), info.exe, info.cd), (m) => !disposed && setStatus(m));
      if (disposed) return void dos.exit();
      ci.current = dos;
      const audio = attachAudio(dos);
      volume.current = audio.setVolume;
      audio.setVolume(effectiveVolume(prefs));
      cleanups.push(attachVideo(dos, canvas.current!), audio.detach);
      cleanups.push(
        watchGamepad(info.input, {
          key: (k, p) => dos.sendKeyEvent(k, p),
          mouseButton: (b, p) => dos.sendMouseButton(b, p),
          moveCursor: (dx, dy) => {
            const c = cursor.current;
            c.x = Math.min(1, Math.max(0, c.x + dx));
            c.y = Math.min(1, Math.max(0, c.y + dy));
            dos.sendMouseMotion(c.x, c.y);
          },
        }),
      );
      setStatus("");
      // 아이콘이 없던 게임은 첫 실행 화면을 썸네일로 쓴다: 로고가 지나간 뒤 충분히 밝은 화면을 찍고,
      // 그 전에 나가면 그때까지 가장 밝았던 화면을 쓴다
      if (!(await hasThumbnail(game.id))) {
        const startedAt = Date.now();
        let best: { lit: number; png: Promise<Blob> } | null = null;
        let done = false;
        const save = async () => {
          if (done || !best) return;
          done = true;
          clearInterval(thumbTimer);
          await saveFirstRunThumbnail(game.id, await best.png);
          void uploadGame(game.id).catch(() => undefined); // 다른 기기에서도 보이게
        };
        const thumbTimer = setInterval(() => {
          const c = canvas.current;
          if (!c?.width || Date.now() - startedAt < 4000) return;
          const lit = litFractionOf(c, c.width, c.height);
          if (lit > (best?.lit ?? 0.01)) best = { lit, png: squarePng(c, c.width, c.height) };
          if (lit >= 0.08 && Date.now() - startedAt >= 10000) void save();
        }, 2000);
        cleanups.push(() => void save().catch(() => undefined), () => clearInterval(thumbTimer));
      }
      setBridge({
        save: async () => ({ state: await saveDosState(dos), thumb: await snapshot() }),
        load: (state) => loadDosState(dos, state),
      });
      const stopWatch = await watchSaves(dos, {
        pattern: game.dos!.savePattern,
        previous: [...saves.keys()],
        onChange: async (now: FileMap) => {
          for (const p of (await listFiles(`${dir}/saves`)).keys()) if (!now.has(p)) await removeFile(`${dir}/saves/${p}`);
          for (const [p, d] of now) await writeFile(`${dir}/saves/${p}`, d);
          markDirty(game.id);
          setToast("저장되었습니다");
          setTimeout(() => setToast(""), 2000);
        },
      });
      if (disposed) stopWatch();
      else cleanups.push(stopWatch);
    })().catch((e) => setStatus((e as Error).message));
    return () => {
      disposed = true;
      cleanups.forEach((c) => c());
      void ci.current?.exit();
      ci.current = null;
    };
  }, []);

  // 입력: 실제 마우스만 화면 위에서 받는다 (절대 좌표). 터치는 트랙패드로만 마우스를 움직인다
  useEffect(() => {
    const el = wrap.current!;
    const isMouse = (e: PointerEvent) => e.pointerType === "mouse" && !isUi(e.target);
    const move = (e: PointerEvent) => {
      if (!isMouse(e)) return;
      cursor.current = toLocal(e, canvas.current!.getBoundingClientRect(), rotation.current);
      ci.current?.sendMouseMotion(cursor.current.x, cursor.current.y);
    };
    let pressedAt = 0;
    const down = (e: PointerEvent) => {
      if (!isMouse(e)) return;
      move(e);
      pressedAt = performance.now();
      ci.current?.sendMouseButton(e.button === 2 ? 1 : 0, true);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      // 아주 빠른 클릭은 게임이 버튼 상태를 읽기 전에 끝나버리므로 최소한 누른 상태를 유지한다
      const button = e.button === 2 ? 1 : 0;
      const wait = Math.max(0, MIN_PRESS_MS - (performance.now() - pressedAt));
      setTimeout(() => ci.current?.sendMouseButton(button, false), wait);
    };
    const key = (pressed: boolean) => (e: KeyboardEvent) => {
      const k = remap[e.code] ?? toDosKey(e.code); // 키 재배치가 있으면 그것을 쓴다
      if (k === undefined) return;
      e.preventDefault();
      ci.current?.sendKeyEvent(k, pressed);
    };
    const kd = key(true);
    const ku = key(false);
    const noMenu = (e: Event) => e.preventDefault();
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("contextmenu", noMenu);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("contextmenu", noMenu);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  return (
    <div class="game" ref={wrap} style={rotatedStyle(orientation.rotation)}>
      <div class="screen">
        <canvas ref={canvas} class={`filter-${prefs.filter}`} />
        {prefs.filter === "crt" && <div class="crt-overlay" />}
      </div>
      <GameMenu gameId={game.id} title={game.title} bridge={bridge} onExit={onExit} orientation={orientation}>
        {touchDevice && (
          <div class="menu-row">
            <span>트랙패드 위치</span>
            <div class="seg glass">
              {PAD_SIDES.map((p) => (
                <button key={p.side} class={prefs.padSide === p.side ? "on" : ""} onClick={() => setPrefs({ padSide: p.side })}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </GameMenu>
      {touchDevice && (
        <div class={`vbar pad-${prefs.padSide}`}>
          <VirtualKeys keys={KEYS} onKey={(k, p) => ci.current?.sendKeyEvent(k, p)} />
          <Trackpad
            rotation={orientation.rotation}
            onMove={(dx, dy) => {
              const c = cursor.current;
              c.x = Math.min(1, Math.max(0, c.x + dx));
              c.y = Math.min(1, Math.max(0, c.y + dy));
              ci.current?.sendMouseMotion(c.x, c.y);
            }}
            onButton={(b, p) => ci.current?.sendMouseButton(b, p)}
          />
        </div>
      )}
      {status && <div class="overlay">{status}</div>}
      {toast && <div class="glass toast">{toast}</div>}
    </div>
  );
}
