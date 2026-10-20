// DOS 플레이 화면: js-dos로 띄운 게임 + 메뉴 + 입력(마우스·키보드, 게임패드, 휴대폰 가상 키·트랙패드).
import type { CommandInterface } from "emulators";
import { useEffect, useRef, useState } from "preact/hooks";
import { uploadGame } from "../../cloud/games";
import { gameDir, type Game } from "../../library/library";
import { listFiles, removeFile, writeFile, type FileMap } from "../../library/store";
import { squarePng } from "../../library/thumbnail";
import { watchFirstRunThumbnail } from "../../player/first-run-thumbnail";
import { pausable, type StateBridge } from "../../player/bridge";
import { GameMenu } from "../../player/GameMenu";
import { useMenuState } from "../../player/MenuButton";
import { ControlTop } from "../../player/QuickButtons";
import { rotatedStyle, touchDevice, useOrientation } from "../../player/orientation";
import { Screen } from "../../player/Screen";
import { useToast } from "../../player/useToast";
import { BusyOverlay } from "../../ui/Spinner";
import { useCanvasLuma } from "../../player/useCanvasLuma";
import { markDirty } from "../../sync/sync";
import { usePrefs } from "../../ui/prefs";
import { attachAudio, attachVideo, createDos, dosFastForward, gameExited, loadDosState, saveDosState } from "./create-dos";
import { nudgeCursor, useDosMouseKeyboard, type Cursor } from "./dos-input";
import { DosTouchControls, DosTouchSettings, MouseSpeedSetting, useVirtualKeys } from "./DosTouch";
import { watchGamepad } from "./gamepad";
import { CD_DIR, HDD_DIR, buildConf, withCycles } from "./profiles";
import { watchSaves } from "./save-watch";

/** 에뮬레이터 FS에 넣을 파일: 원본 HDD + 그 위에 덮는 세이브 + CD 이미지 */
async function gameFiles(dir: string) {
  const files = new Map<string, File>(); // 파일 내용은 createDos가 필요한 만큼만 읽는다
  for (const [p, f] of await listFiles(`${dir}/${HDD_DIR}`)) files.set(`${HDD_DIR}/${p}`, f);
  const saves = await listFiles(`${dir}/saves`);
  for (const [p, f] of saves) files.set(`${HDD_DIR}/${p}`, f);
  for (const [p, f] of await listFiles(`${dir}/${CD_DIR}`)) files.set(`${CD_DIR}/${p}`, f);
  return { files, saves };
}

export function DosPlayer({ game, onExit }: { game: Game; onExit: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ci = useRef<CommandInterface | null>(null);
  const cursor = useRef<Cursor>({ x: 0.5, y: 0.5 });
  const [status, setStatus] = useState("불러오는 중…");
  const [failed, setFailed] = useState(false);
  const [toast, showToast] = useToast();
  const [bridge, setBridge] = useState<StateBridge | null>(null);
  const [run, setRun] = useState(0); // 재시작: 바뀌면 에뮬레이터를 새로 띄운다 (js-dos에는 리셋이 없다)
  const orientation = useOrientation();
  const rotation = useRef(0);
  rotation.current = orientation.rotation;
  const prefs = usePrefs();
  const menu = useMenuState(bridge);
  const vkeys = useVirtualKeys(game);
  const dir = gameDir(game.id);
  const info = game.dos!;

  useDosMouseKeyboard({ stage, canvas, ci, cursor, rotation });
  useCanvasLuma(canvas, rotation); // 화면 위 버튼 글자색을 화면 밝기에 맞춘다

  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];
    (async () => {
      const { files, saves } = await gameFiles(dir);
      setStatus("에뮬레이터 시작 중…");
      const dos = await createDos(files, buildConf(withCycles(info.settings, info.cycles), info.exe, info.cd), (m) => !disposed && setStatus(m));
      if (disposed) return void dos.exit();
      ci.current = dos;
      cleanups.push(attachVideo(dos, canvas.current!), attachAudio(dos));
      cleanups.push(
        watchGamepad(info.input, {
          key: (k, p) => dos.sendKeyEvent(k, p),
          mouseButton: (b, p) => dos.sendMouseButton(b, p),
          moveCursor: (dx, dy) => nudgeCursor(cursor.current, dos, dx, dy),
        }),
      );
      setStatus("");

      const capture = async () => (canvas.current?.width ? squarePng(canvas.current, canvas.current.width, canvas.current.height) : null);
      const finishThumb = watchFirstRunThumbnail(game.id, capture, () => void uploadGame(game.id).catch(() => undefined));
      cleanups.push(() => void finishThumb().catch(() => undefined));

      const snapshot = () => new Promise<Blob | null>((resolve) => (canvas.current ? canvas.current.toBlob(resolve, "image/png") : resolve(null)));
      const setFast = dosFastForward(dos);
      setBridge(
        pausable({
          save: async () => ({ state: await saveDosState(dos), thumb: await snapshot() }),
          load: (state) => loadDosState(dos, state),
          setFastForward: async (on) => setFast(on),
          pause: () => dos.pause(),
          resume: () => dos.resume(),
          reset: async () => {
            setStatus("다시 시작하는 중…");
            setRun((n) => n + 1);
          },
          screenshot: snapshot,
        }),
      );

      // 게임 안 세이브 파일이 바뀌면 기기에 저장하고 드라이브 동기화를 예약한다
      const saveWatch = await watchSaves(dos, {
        pattern: info.savePattern,
        previous: [...saves.keys()],
        onChange: async (now: FileMap) => {
          for (const p of (await listFiles(`${dir}/saves`)).keys()) if (!now.has(p)) await removeFile(`${dir}/saves/${p}`);
          for (const [p, d] of now) await writeFile(`${dir}/saves/${p}`, d);
          markDirty(game.id, "saves");
          showToast("저장되었습니다");
        },
      });
      if (disposed) return saveWatch.stop();
      cleanups.push(() => saveWatch.stop());

      // 게임 안에서 끝내면(DOS로 돌아오면) 세이브를 마저 저장하고 라이브러리로 돌아간다.
      // 자동 저장 슬롯은 남기지 않는다 (DOS 프롬프트 상태라 쓸모가 없고, 전에 둔 자동 저장을 덮는다)
      const exitTimer = setInterval(async () => {
        if (disposed || !(await gameExited(dos))) return;
        clearInterval(exitTimer);
        setStatus("게임을 마치는 중…");
        await saveWatch.flush().catch(() => undefined);
        if (!disposed) onExit();
      }, 1000);
      cleanups.push(() => clearInterval(exitTimer));
    })().catch((e) => {
      setFailed(true);
      setStatus((e as Error).message);
    });
    return () => {
      disposed = true;
      cleanups.forEach((c) => c());
      void ci.current?.exit();
      ci.current = null;
      setBridge(null);
    };
  }, [run]);

  return (
    <div class={`game${touchDevice ? "" : " hide-cursor"}`} ref={stage} style={rotatedStyle(orientation.rotation)}>
      <Screen canvasRef={canvas} filter={prefs.filter} />
      <GameMenu
        menu={menu}
        floating={!touchDevice}
        gameId={game.id}
        title={game.title}
        bridge={bridge}
        onExit={onExit}
        orientation={orientation}
        controls={() =>
          touchDevice && (
            <>
              <DosTouchSettings keys={vkeys.keys} landscape={orientation.mode === "landscape"} onChange={(k) => void vkeys.set(k)} onReset={() => void vkeys.reset()} />
              <MouseSpeedSetting />
            </>
          )
        }
      />
      {touchDevice && (
        <DosTouchControls
          keys={vkeys.keys}
          rotation={orientation.rotation}
          landscape={orientation.mode === "landscape"}
          onKey={(k, p) => ci.current?.sendKeyEvent(k, p)}
          onMove={(dx, dy) => nudgeCursor(cursor.current, ci.current, dx, dy)}
          onButton={(b, p) => ci.current?.sendMouseButton(b, p)}
          top={<ControlTop menu={menu} bridge={bridge} />}
        />
      )}
      {status && <BusyOverlay text={status} failed={failed} />}
      {toast && <div class="glass toast">{toast}</div>}
    </div>
  );
}
