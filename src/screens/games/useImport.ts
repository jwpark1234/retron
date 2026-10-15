// 게임 추가: 고르거나 끌어다 놓은 파일을 라이브러리에 넣고, 내 구글 드라이브에 올린다.
// 실행 파일이 여러 개면 사용자에게 고르게 한다.
import { useEffect, useState } from "preact/hooks";
import { uploadGame } from "../../cloud/games";
import { importFiles, type Entry } from "../../library/import";
import { fromDrop } from "../../library/pick";
import { explainError } from "../../library/store";

export interface ExeChoice {
  candidates: string[];
  resolve: (v: string | null) => void;
}

export function useImport(onAdded: () => Promise<void>) {
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [choice, setChoice] = useState<ExeChoice | null>(null);

  const add = async (picked: Entry[]) => {
    if (!picked.length || progress) return;
    setError("");
    try {
      const added = await importFiles(picked, {
        progress: setProgress,
        chooseExe: (candidates) => new Promise((resolve) => setChoice({ candidates, resolve })),
      });
      await onAdded();
      // 뒤에서 하나씩 올린다
      void (async () => {
        for (const g of added) await uploadGame(g.id).catch(async (err) => setError(`드라이브에 올리지 못했습니다: ${await explainError(err)}`));
      })();
    } catch (err) {
      setError(await explainError(err));
    }
    setProgress("");
  };

  const choose = (v: string | null) => {
    choice?.resolve(v);
    setChoice(null);
  };

  return { add, progress, error, choice, choose, fail: setError };
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
