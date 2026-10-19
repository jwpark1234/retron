// 게임 추가: 고르거나 끌어다 놓은 파일을 내 구글 드라이브에 올리는 것과 이 기기에서 실행 준비(풀기)를 동시에 한다.
// 드라이브에는 고른 파일을 그대로 올린다. 실행 파일이 여러 개면 사용자에게 고르게 한다.
import { useEffect, useState } from "preact/hooks";
import { startPickedUpload, uploadGame, type PickedUpload } from "../../cloud/games";
import { importFiles, keepSource, type Entry } from "../../library/import";
import { sourceDir, type Game } from "../../library/library";
import { fromDrop } from "../../library/pick";
import { removeDir } from "../../library/store";

export interface ExeChoice {
  candidates: string[];
  resolve: (v: string | null) => void;
}

const base = (p: string) => p.split("/").pop()!;

export function useImport(onAdded: () => Promise<void>) {
  const [progress, setProgress] = useState("");
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState<ExeChoice | null>(null);
  const failUpload = (err: unknown) => setError(`드라이브에 올리지 못했습니다: ${(err as Error).message}`);

  /** 동시에 올리던 것을 마무리한다. 아직 올리는 중이면 원본을 기기에도 보관해 둔다 (앱을 닫아도 다음에 다시 올리게) */
  const settle = async (upload: PickedUpload, game: Game, picked: Entry[]) => {
    upload.setCard(game.id);
    const kept = upload.state() === "running";
    if (kept) await keepSource(game, picked).catch(() => undefined);
    try {
      await upload.finish(game);
      if (kept) await removeDir(sourceDir(game.id));
    } catch {
      // 동시 올리기 실패: 원본을 기기에 두고 보통 올리기(이어 올리기·Wi-Fi 대기·재시도)로 넘긴다
      upload.discard();
      if (!kept) await keepSource(game, picked).catch(() => undefined);
      await uploadGame(game.id).catch(failUpload);
    }
    await onAdded();
  };

  const add = async (picked: Entry[]) => {
    if (!picked.length || progress) return;
    setError("");
    setUploadPct(null);
    const upload = startPickedUpload(
      picked.map((e) => ({ name: base(e.path), file: e.file })),
      base(picked[0].path).replace(/\.[^.]+$/, ""),
      (f) => setUploadPct(Math.floor(f * 100)),
    );
    try {
      const added = await importFiles(picked, {
        progress: setProgress,
        chooseExe: (candidates) => new Promise((resolve) => setChoice({ candidates, resolve })),
      });
      await onAdded();
      if (upload && added.length === 1) void settle(upload, added[0], picked);
      else {
        // 지금 못 올리거나(오프라인, 모바일 데이터), zip 하나에서 게임이 여럿 나왔으면(롬마다 따로 올린다) 뒤에서 하나씩
        upload?.discard();
        void (async () => {
          for (const g of added) {
            await keepSource(g, picked).catch(() => undefined);
            await uploadGame(g.id).catch(failUpload);
          }
        })();
      }
    } catch (err) {
      upload?.discard();
      setError((err as Error).message);
    }
    setProgress("");
    setUploadPct(null);
  };

  const choose = (v: string | null) => {
    choice?.resolve(v);
    setChoice(null);
  };

  // 위쪽 막대에 보여 줄 문구: 기기 준비 진행 + 드라이브 올리기 진행
  const status = progress && (uploadPct === null ? progress : `${progress} · 드라이브 ${uploadPct}%`);
  return { add, progress: status, error, choice, choose, fail: setError };
}

/** PC: 파일을 창에 끌어다 놓으면 onDrop (폴더가 섞여 있으면 null). 끄는 동안 true를 돌려준다 */
export function useFileDrop(onDrop: (entries: Entry[] | null) => void, deps: unknown[]): boolean {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => hasFiles(e) && (depth++, setDragging(true));
    const leave = (e: DragEvent) => hasFiles(e) && --depth <= 0 && ((depth = 0), setDragging(false));
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      onDrop(fromDrop(e.dataTransfer!));
    };
    addEventListener("dragenter", enter);
    addEventListener("dragleave", leave);
    addEventListener("dragover", over);
    addEventListener("drop", drop);
    return () => {
      removeEventListener("dragenter", enter);
      removeEventListener("dragleave", leave);
      removeEventListener("dragover", over);
      removeEventListener("drop", drop);
    };
  }, deps);
  return dragging;
}
