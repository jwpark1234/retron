// 로고: 베이지 CRT 모니터, 화면에 호박색(앱 주황) 형광 도트 글씨 RETRON. 화면에만 CRT 효과(주사선, 빛 번짐, RGB 어긋남, 가장자리 어둠, 유리 반사).
// 몸체는 선명한 평면에 아래 두께만 (2026-10-30 사용자 요청: 단색 고리 로고가 앱과 안 맞았다). 아이콘은 같은 모니터 (scripts/art/icon-crt.html)
// 글씨는 5×7 도트로 직접 그린다 (글꼴에 상관없이 같은 모양). 좌표 단위 = 도트 하나
import { useId } from "preact/hooks";

const GLYPHS: Record<string, string[]> = {
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  N: ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
};

/** 글자들을 도트 경로 하나로 (글자 폭 5, 사이 1) */
export function dotPath(text: string): string {
  let d = "";
  [...text].forEach((ch, i) =>
    GLYPHS[ch].forEach((row, y) => [...row].forEach((on, x) => on === "1" && (d += `M${i * 6 + x} ${y}h1v1h-1z`))),
  );
  return d;
}
const WORD = dotPath("RETRON"); // 35×7

export function Logo({ size = "large" }: { size?: "large" | "small" }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const small = size === "small";
  // 몸체: 화면 둘레 4, 아래 턱(전원 램프). 큰 로고는 받침대까지
  const body = small ? { x: -7, y: -7.5, w: 49, h: 23 } : { x: -9, y: -9, w: 53, h: 28.5 };
  const bottom = body.y + body.h;
  const vb = small ? "-7.5 -8 50 25" : "-9.5 -9.5 54 35";
  const u = (s: string) => `url(#${s}${id})`;
  return (
    <span class={`logo ${size}`} role="img" aria-label="retron">
      <svg viewBox={vb} aria-hidden="true">
        <defs>
          <linearGradient id={`case${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#f1ebdc" />
            <stop offset="1" stop-color="#d6cdb6" />
          </linearGradient>
          <radialGradient id={`glass${id}`} cx="0.5" cy="0.45" r="0.75">
            <stop offset="0" stop-color="#2b1a08" />
            <stop offset="1" stop-color="#0e0804" />
          </radialGradient>
          <radialGradient id={`vig${id}`} cx="0.5" cy="0.5" r="0.62">
            <stop offset="0.55" stop-color="#000" stop-opacity="0" />
            <stop offset="1" stop-color="#000" stop-opacity="0.6" />
          </radialGradient>
          <radialGradient id={`bloom${id}`}>
            <stop offset="0" stop-color="#ff9a2a" stop-opacity="0.22" />
            <stop offset="1" stop-color="#ff9a2a" stop-opacity="0" />
          </radialGradient>
          <linearGradient id={`glare${id}`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stop-color="#fff" stop-opacity="0.16" />
            <stop offset="0.5" stop-color="#fff" stop-opacity="0" />
          </linearGradient>
          <pattern id={`scan${id}`} width="1" height={small ? 1 : 0.5} patternUnits="userSpaceOnUse">
            <rect y={small ? 0.62 : 0.3} width="1" height={small ? 0.38 : 0.2} fill="#000" fill-opacity="0.5" />
          </pattern>
          <filter id={`glow${id}`} x="-20%" y="-60%" width="140%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={small ? 0.9 : 1.4} result="wide" />
            <feGaussianBlur in="SourceGraphic" stdDeviation={small ? 0.2 : 0.35} result="near" />
            <feMerge>
              <feMergeNode in="wide" />
              <feMergeNode in="wide" />
              <feMergeNode in="near" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id={`scr${id}`}>
            <rect x="-4.5" y="-4.5" width="44" height="16" rx="3" />
          </clipPath>
        </defs>
        {!small && (
          <g>
            <path d={`M12 ${bottom} H23 L25 ${bottom + 3} H10 Z`} fill="#bdb39b" />
            <rect x="4" y={bottom + 3} width="27" height="2.6" rx="1.2" fill="#a89d84" />
            <rect x="4" y={bottom + 2.6} width="27" height="2" rx="1" fill={u("case")} />
          </g>
        )}
        {/* 몸체: 아래로 두께, 위 가장자리에 밝은 줄 */}
        <rect x={body.x} y={body.y + 1.2} width={body.w} height={body.h} rx="4" fill="#a89d84" />
        <rect x={body.x} y={body.y} width={body.w} height={body.h} rx="4" fill={u("case")} />
        <rect x={body.x + 3.5} y={body.y + 0.45} width={body.w - 7} height="0.45" rx="0.22" fill="#fff" fill-opacity="0.75" />
        {/* 화면이 박힌 홈 */}
        <rect x="-5.6" y="-5.6" width="46.2" height="18.2" rx="3.8" fill="#4a4335" />
        {/* 화면 */}
        <g clip-path={u("scr")}>
          <rect x="-4.5" y="-4.5" width="44" height="16" fill={u("glass")} />
          <ellipse cx="17.5" cy="3.5" rx="22" ry="7" fill={u("bloom")} />
          <g filter={u("glow")}>
            <path d={WORD} fill="#ff3b1f" fill-opacity="0.55" transform="translate(-0.22 0)" />
            <path d={WORD} fill="#2fd3ff" fill-opacity="0.3" transform="translate(0.22 0)" />
            <path d={WORD} fill="#ffc260" />
          </g>
          <rect x="-4.5" y="-4.5" width="44" height="16" fill={u("scan")} />
          <rect x="-4.5" y="-4.5" width="44" height="16" fill={u("vig")} />
          <rect x="-4.5" y="-4.5" width="44" height="16" fill={u("glare")} />
        </g>
        {/* 턱: 전원 램프와 통풍 홈 */}
        <circle cx="38" cy={bottom - (small ? 1.6 : 3.4)} r={small ? 0.75 : 0.9} fill="#41e86a" />
        {!small &&
          [0, 1, 2, 3].map((i) => <rect key={i} x={-4.5 + i * 2.2} y={bottom - 5.2} width="1.1" height="3.6" rx="0.55" fill="#b5ab92" />)}
      </svg>
    </span>
  );
}
