// 로고: RETRON 한 줄. O 자리에 주황 고리(아이콘과 같은 모양). 주사선·글자 번짐 같은 효과 없이 단색으로
// (예전 CRT 로고는 음산하고 어수선했다 — 2026-10-30 사용자 요청)
export function Logo({ size = "large" }: { size?: "large" | "small" }) {
  return (
    <span class={`logo ${size}`} role="img" aria-label="retron">
      <span aria-hidden="true">RETR</span>
      <i class="ring" aria-hidden="true" />
      <span aria-hidden="true">N</span>
    </span>
  );
}
