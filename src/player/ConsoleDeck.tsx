// 휴대폰 세로 화면 조작 영역의 빈자리에 넣는 게임기 몸체 장식. 누를 수 없다.
// 버튼처럼 보이는 장식(스위치, 꺼내기 버튼, 레버)은 넣지 않는다: 진짜 버튼과 헷갈렸다 (2026-10-28 사용자 요청).
// 램프·표시창·슬롯·카트리지·디스켓·스피커 구멍과 몸체에 인쇄하거나 새긴 글씨만 쓴다.
// DOS: 옛날 PC 앞면(디스켓이 꽂히는 3.5인치 드라이브, 5.25인치 드라이브, 터보 표시창·램프)
// SFC·N64: 게임기 윗면(카트리지 슬롯에 꽂힌 카트리지, 전원 램프)
// GBA: 휴대용 게임기 아래쪽(전원 램프, 스피커 구멍)
// 디스켓·카트리지 라벨에는 게임 이름을 쓴다 (카트리지 라벨 색은 이름마다 다르다). 재질과 버튼 모양은 console-skins.css가 기종마다 정한다
import type { Platform } from "../library/library";
import "./console-skins.css";

export function ConsoleDeck({ platform, title }: { platform: Platform; title: string }) {
  return (
    <div class={`deck deck-${platform}`} aria-hidden="true">
      {platform === "dos" ? <PcFront title={title} /> : platform === "gba" ? <HandheldFront /> : <ConsoleTop title={title} />}
    </div>
  );
}

/** 게임 이름으로 정하는 라벨 색 (0~359) */
const hueOf = (title: string) => [...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

function PcFront({ title }: { title: string }) {
  return (
    <>
      <div class="pc-bays">
        <div class="bay bay-35">
          <div class="diskette">
            <span class="shutter" />
            <span class="label">{title}</span>
          </div>
          <span class="deck-slot" />
          <span class="led busy" />
        </div>
        <div class="bay bay-525">
          <span class="deck-slot" />
        </div>
      </div>
      <div class="pc-panel">
        <SevenSegment digits="66" />
        <div class="pc-leds">
          <span>
            <i class="led on" />
            POWER
          </span>
          <span>
            <i class="led amber" />
            TURBO
          </span>
          <span>
            <i class="led busy" />
            HDD
          </span>
        </div>
        <div class="pc-print">RETRON 486DX</div>
      </div>
    </>
  );
}

// 7세그먼트 한 자리 (12×22). 꺼진 획도 흐리게 보인다
const SEGMENTS: Record<string, string> = {
  a: "2,0 10,0 11,1 10,2 2,2 1,1",
  b: "11,1 12,2 12,9 11,10 10,9 10,2",
  c: "11,12 12,13 12,20 11,21 10,20 10,13",
  d: "2,20 10,20 11,21 10,22 2,22 1,21",
  e: "1,12 2,13 2,20 1,21 0,20 0,13",
  f: "1,1 2,2 2,9 1,10 0,9 0,2",
  g: "2,10 10,10 11,11 10,12 2,12 1,11",
};
const LIT: Record<string, string> = { "6": "acdefg", "8": "abcdefg" };

function SevenSegment({ digits }: { digits: string }) {
  return (
    <div class="seven-seg">
      {[...digits].map((d, i) => (
        <svg key={i} viewBox="-1 -1 14 24">
          {Object.entries(SEGMENTS).map(([s, points]) => (
            <polygon key={s} points={points} class={LIT[d]?.includes(s) ? "on" : ""} />
          ))}
        </svg>
      ))}
    </div>
  );
}

function ConsoleTop({ title }: { title: string }) {
  return (
    <>
      <div class="deck-print">
        <i class="led on" />
        POWER
      </div>
      <div class="cart-bay">
        <div class="cart">
          <span class="label" style={{ "--hue": String(hueOf(title)) }}>
            <b>{title}</b>
          </span>
        </div>
        <span class="deck-slot" />
      </div>
      <div class="deck-print engraved">RETRON</div>
    </>
  );
}

function HandheldFront() {
  return (
    <>
      <div class="hh-name">
        <span class="deck-print">
          <i class="led on" />
          POWER
        </span>
        <strong class="engraved">RETRON</strong>
      </div>
      <div class="hh-speaker">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} />
        ))}
      </div>
    </>
  );
}
