import { useEffect, useState } from "preact/hooks";
import { GAME_ID, TITLE } from "./game-config";
import { importGame } from "./fs/import-game";
import { exists } from "./fs/store";

export function Splash({ onStart }: { onStart: () => void }) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void navigator.storage.persist?.();
    exists(`${GAME_ID}/ready`).then(setReady);
  }, []);

  const onPick = async (e: Event) => {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    if (!files.length) return;
    setError("");
    try {
      await importGame(files, setProgress);
      setReady(true);
    } catch (err) {
      setError((err as Error).message);
    }
    setProgress("");
  };

  return (
    <div class="splash">
      <h1>{TITLE}</h1>
      {ready && !progress && (
        <button class="start" onClick={onStart}>
          시작하기
        </button>
      )}
      {progress ? (
        <p>{progress}</p>
      ) : (
        ready !== null && (
          <label class="pick">
            {ready ? "게임 파일 다시 가져오기" : "게임 폴더 선택"}
            <input type="file" {...{ webkitdirectory: true }} onChange={onPick} hidden />
          </label>
        )
      )}
      {ready === false && !progress && (
        <p class="hint">
          게임 폴더(GENE2.COM)와 CD 이미지(bin/cue)가 함께 들어 있는 폴더를 고르세요. 처음 한 번만 하면 됩니다.
        </p>
      )}
      {error && <p class="error">{error}</p>}
    </div>
  );
}
