// 로고: RETRO 아래 줄 끝(O 밑)에 N이 내려앉은 모양. O만 주황 + CRT 효과 (아이콘과 같은 O).
export function Logo({ size = "large" }: { size?: "large" | "small" }) {
  return (
    <span class={`logo ${size}`} role="img" aria-label="retron">
      <span aria-hidden="true">
        RETR<em>O</em>
      </span>
      <span class="n" aria-hidden="true">
        N
      </span>
    </span>
  );
}
