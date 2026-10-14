import { useEffect, useRef, useState } from "preact/hooks";
import type { CommandInterface } from "emulators";
import { gameDir, type Game } from "../../library/library";
import { listFiles, readDir, removeFile, writeFile, type FileMap } from "../../library/store";
import { GameMenu, type StateBridge } from "../../ui/GameMenu";
import { saveFirstRunThumbnail } from "../../library/thumbnail";
import { rotatedStyle } from "../../ui/RotatedStage";
import { toLocal, useOrientation } from "../../ui/orientation";
import { VirtualKeys } from "../../ui/VirtualKeys";
import { attachAudio, attachVideo, createDos, loadDosState, saveDosState, toDosKey } from "./create-dos";
import { CD_DIR, HDD_DIR } from "./profiles";
import { watchSaves } from "./save-watch";

const LONG_PRESS_MS = 500;
const MIN_PRESS_MS = 80;
const KEYS = [
  { label: "ESC", key: 256 },
  { label: "Enter", key: 257 },
  { label: "Space", key: 32 },
  { label: "Y", key: 89 },
  { label: "N", key: 78 },
];
const isUi = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest(".vkeys, .menu-button, .menu-backdrop");

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

  const snapshot = () => new Promise<Blob | null>((resolve) => (canvas.current ? canvas.current.toBlob(resolve, "image/png") : resolve(null)));
  // 화면 전환 중(거의 검은 화면)은 썸네일로 쓰지 않는다
  const mostlyBlack = () => {
    const c = canvas.current;
    if (!c || !c.width) return true;
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4 * 64) if (d[i] + d[i + 1] + d[i + 2] > 48) lit++;
    return lit < d.length / (4 * 64) / 20;
  };

  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];
    (async () => {
      const hdd = await readDir(`${dir}/${HDD_DIR}`);
      const saves = await readDir(`${dir}/saves`);
      for (const [p, d] of saves) hdd.set(p, d); // 세이브를 원본 위에 덮는다
      const cd = await readDir(`${dir}/${CD_DIR}`);
      setStatus("에뮬레이터 시작 중…");
      const dos = await createDos(hdd, cd, game.dos!.conf);
      if (disposed) return void dos.exit();
      ci.current = dos;
      cleanups.push(attachVideo(dos, canvas.current!), attachAudio(dos));
      setStatus("");
      // 아이콘이 없던 게임은 첫 실행 화면을 썸네일로 쓴다 (로고가 지나간 뒤, 검은 화면이 아닐 때)
      const startedAt = Date.now();
      const thumbTimer = setInterval(() => {
        if (Date.now() - startedAt < 8000 || mostlyBlack()) return;
        clearInterval(thumbTimer);
        const c = canvas.current!;
        void saveFirstRunThumbnail(game.id, c, c.width, c.height);
      }, 2000);
      cleanups.push(() => clearInterval(thumbTimer));
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

  // 입력: 마우스는 절대 좌표, 터치는 탭=좌클릭 / 길게 누르기=우클릭
  useEffect(() => {
    const el = wrap.current!;
    const move = (e: PointerEvent) => {
      const { x, y } = toLocal(e, canvas.current!.getBoundingClientRect(), rotation.current);
      ci.current?.sendMouseMotion(x, y);
    };
    const click = (button: number) => {
      ci.current?.sendMouseButton(button, true);
      setTimeout(() => ci.current?.sendMouseButton(button, false), 100);
    };
    let longPress: ReturnType<typeof setTimeout> | undefined;
    let longPressed = false;
    let pressedAt = 0;
    const down = (e: PointerEvent) => {
      if (isUi(e.target)) return;
      move(e);
      if (e.pointerType === "mouse") {
        pressedAt = performance.now();
        return ci.current?.sendMouseButton(e.button === 2 ? 1 : 0, true);
      }
      longPressed = false;
      longPress = setTimeout(() => {
        longPressed = true;
        click(1);
      }, LONG_PRESS_MS);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        // 아주 빠른 클릭은 게임이 버튼 상태를 읽기 전에 끝나버리므로 최소한 누른 상태를 유지한다
        const button = e.button === 2 ? 1 : 0;
        const wait = Math.max(0, MIN_PRESS_MS - (performance.now() - pressedAt));
        return void setTimeout(() => ci.current?.sendMouseButton(button, false), wait);
      }
      clearTimeout(longPress);
      if (!longPressed && !isUi(e.target)) click(0);
    };
    const key = (pressed: boolean) => (e: KeyboardEvent) => {
      const k = toDosKey(e.code);
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
      <canvas ref={canvas} />
      <GameMenu gameId={game.id} bridge={bridge} onExit={onExit} orientation={orientation} />
      <VirtualKeys keys={KEYS} onKey={(k, p) => ci.current?.sendKeyEvent(k, p)} />
      {status && <div class="overlay">{status}</div>}
      {toast && <div class="glass toast">{toast}</div>}
    </div>
  );
}
