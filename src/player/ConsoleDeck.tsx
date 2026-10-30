// 휴대폰 세로 화면 조작 영역의 빈자리에 넣는 게임기 몸체 장식. 누를 수 없다.
// 버튼처럼 보이는 장식(스위치, 꺼내기 버튼, 레버)은 넣지 않는다: 진짜 버튼과 헷갈렸다 (2026-10-28 사용자 요청).
// 몸체에 인쇄한 납작한 그림만 쓴다: 색 줄무늬와 굵은 기울임 로고, 사양 문구, 전원 램프, 스피커 구멍, PC 드라이브.
// 카트리지·디스켓·스티커·표시창 같은 사실적인 장식은 깔끔한 평면 스타일로 바꾸면서 뺐다 (2026-10-30 사용자 요청). 색은 console-skins.css가 기종마다 정한다
// 맨 위 가운데에 지금 하는 게임 이름을 인쇄한다 (카트리지 라벨처럼). 자리가 모자라면 로고 줄부터 숨기고 이름은 남긴다.
// DOS: PC 본체 앞면(드라이브 둘, 램프), SFC·N64: 게임기 윗면(전원 램프, 로고), GBA·GBC: 휴대용 게임기 아래쪽(전원 램프, 로고, 스피커 구멍)
import type { Platform } from "../library/library";
import "./console-skins.css";

export function ConsoleDeck({ platform, title }: { platform: Platform; title: string }) {
  return (
    <div class={`deck deck-${platform}`} aria-hidden="true">
      <p class="deck-title">{title}</p>
      <div class="deck-row">
        {platform === "dos" ? (
          <PcFront />
        ) : platform === "gba" || platform === "gbc" ? (
          <HandheldFront bits={platform === "gba" ? "32" : "8"} />
        ) : (
          <ConsoleTop bits={platform === "n64" ? "64" : "16"} />
        )}
      </div>
    </div>
  );
}

const Power = () => (
  <span class="deck-print">
    <i class="led on" />
    POWER
  </span>
);

/** 몸체에 인쇄한 로고: 왼쪽에서 달려오는 색 줄무늬 + 굵은 기울임 이름, 아래에 사양 문구 */
const Logo = ({ spec }: { spec: string }) => (
  <div class="deck-logo">
    <span class="stripes">
      <i />
      <i />
      <i />
    </span>
    <b>RETRON</b>
    <small>{spec}</small>
  </div>
);

function PcFront() {
  return (
    <>
      <div class="pc-drives">
        <span class="drive">
          <i class="drive-slot" />
          <i class="led busy" />
        </span>
        <span class="drive wide">
          <i class="drive-slot" />
        </span>
      </div>
      <div class="pc-panel">
        <Power />
        <span class="deck-print">
          <i class="led busy" />
          HDD
        </span>
        <Logo spec="486DX2 · 66MHz" />
      </div>
    </>
  );
}

function ConsoleTop({ bits }: { bits: string }) {
  return (
    <>
      <Power />
      <Logo spec={`${bits}-BIT VIDEO GAME SYSTEM`} />
    </>
  );
}

function HandheldFront({ bits }: { bits: string }) {
  return (
    <>
      <div class="hh-name">
        <Power />
        <Logo spec={`${bits}-BIT HANDHELD`} />
      </div>
      <div class="hh-speaker">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} />
        ))}
      </div>
    </>
  );
}
