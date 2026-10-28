// 휴대폰 세로 화면 조작 영역의 빈자리에 넣는 게임기 몸체 장식. 누를 수 없다.
// DOS: 옛날 PC 앞면(디스켓을 넣는 3.5인치 드라이브, 5.25인치 드라이브, 터보 표시창·램프)
// SFC·N64: 게임기 윗면(카트리지 슬롯에 꽂힌 카트리지, POWER·RESET 스위치)
// GBA: 휴대용 게임기 아래쪽(전원 램프, 스피커 구멍)
// 디스켓·카트리지 라벨에는 게임 이름을 쓴다. 몸체 색과 버튼 모양은 console-skins.css가 기종마다 정한다. 자리가 좁으면 장식을 줄인다
import type { Platform } from "../library/library";
import "./console-skins.css";

export function ConsoleDeck({ platform, title }: { platform: Platform; title: string }) {
  return (
    <div class={`deck deck-${platform}`} aria-hidden="true">
      {platform === "dos" ? <PcFront title={title} /> : platform === "gba" ? <HandheldFront /> : <ConsoleTop title={title} />}
    </div>
  );
}

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
          <span class="eject" />
          <span class="led busy" />
        </div>
        <div class="bay bay-525">
          <span class="deck-slot" />
          <span class="lever" />
        </div>
      </div>
      <div class="pc-panel">
        <div class="turbo">66</div>
        <div class="pc-leds">
          <span><i class="led on" />POWER</span>
          <span><i class="led turbo-on" />TURBO</span>
          <span><i class="led busy" />HDD</span>
        </div>
        <div class="pc-plate">RETRON 486</div>
      </div>
    </>
  );
}

function ConsoleTop({ title }: { title: string }) {
  return (
    <>
      <div class="switch">
        <span class="track">
          <i class="knob on" />
        </span>
        <small>
          <i class="led on" />
          POWER
        </small>
      </div>
      <div class="cart-bay">
        <div class="cart">
          <span class="label">{title}</span>
        </div>
        <span class="deck-slot" />
      </div>
      <div class="switch">
        <span class="track">
          <i class="knob" />
        </span>
        <small>RESET</small>
      </div>
    </>
  );
}

function HandheldFront() {
  return (
    <>
      <div class="hh-name">
        <small>
          <i class="led on" />
          POWER
        </small>
        <strong>RETRON</strong>
      </div>
      <div class="hh-speaker">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} />
        ))}
      </div>
    </>
  );
}
