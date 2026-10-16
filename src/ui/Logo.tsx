// 로고: RETRO 아래 줄 끝(O 밑)에 N이 내려앉은 모양. 글자 전체에 CRT 효과, O만 주황.
export function Logo({ size = "large" }: { size?: "large" | "small" }) {
  return (
    <span class={`logo ${size}`} role="img" aria-label="retron">
      <span aria-hidden="true">
        RETR
        <em>
          <i>O</i>
        </em>
      </span>
      <span class="n" aria-hidden="true">
        N
      </span>
    </span>
  );
}
