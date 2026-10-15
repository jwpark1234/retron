// 세이브 충돌: 다른 기기와 이 기기에서 모두 세이브가 바뀌었을 때 어느 쪽으로 이어서 할지 묻는다.
export function ConflictDialog({ onChoose }: { onChoose: (use: "server" | "device") => void }) {
  return (
    <div class="modal">
      <div class="dialog glass">
        <h2>세이브가 두 곳에서 바뀌었습니다</h2>
        <p class="muted">
          다른 기기에서 올린 세이브와 이 기기의 세이브가 서로 다릅니다. 어느 쪽으로 이어서 할까요? 이 기기 세이브를 버리는 쪽을 골라도 기기에 따로 보관하고, 드라이브 쪽은 구글 드라이브의 버전 기록에 남습니다.
        </p>
        <button class="glass" onClick={() => onChoose("server")}>
          다른 기기 세이브 사용 (드라이브)
        </button>
        <button class="glass" onClick={() => onChoose("device")}>
          이 기기 세이브 사용
        </button>
      </div>
    </div>
  );
}
