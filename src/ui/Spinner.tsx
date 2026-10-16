// 로딩 표시: 도는 고리. 화면 전체를 덮는 진행 표시(BusyOverlay)와 글자 옆에 붙이는 작은 것(Spinner small)으로 쓴다.

export function Spinner({ small }: { small?: boolean }) {
  return <span class={`spinner ${small ? "small" : ""}`} role="progressbar" aria-label="불러오는 중" />;
}

/** 화면을 덮는 진행 표시. failed면 고리 없이 문구만 (오류는 돌고 있으면 안 된다) */
export function BusyOverlay({ text, failed }: { text: string; failed?: boolean }) {
  return (
    <div class="overlay">
      <div class="overlay-body">
        {!failed && <Spinner />}
        <span>{text}</span>
      </div>
    </div>
  );
}
