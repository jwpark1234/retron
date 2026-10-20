// 플랫폼(DOS, SFC·GBA)이 메뉴와 화면 버튼에 내주는 기능: 상태 저장·불러오기, 빨리가기, 일시정지, 재시작, 스크린샷.

export interface StateBridge {
  save(): Promise<{ state: Uint8Array; thumb: Blob | null }>;
  load(state: Uint8Array): Promise<void>;
  setFastForward?(on: boolean): Promise<void>;
  /** 메뉴를 여는 동안 게임을 멈춘다 */
  setPaused(on: boolean): void;
  /** 게임을 처음부터 다시 시작한다 (전원 껐다 켜기) */
  reset(): Promise<void>;
  /** 지금 화면 (기종 해상도 그대로) */
  screenshot(): Promise<Blob | null>;
}

/** 에뮬레이터가 그대로 내주는 기능 */
export interface RawBridge {
  save(): Promise<{ state: Uint8Array; thumb: Blob | null }>;
  load(state: Uint8Array): Promise<void>;
  setFastForward?(on: boolean): Promise<void>;
  pause(): void;
  resume(): void;
  reset(): Promise<void>;
  screenshot(): Promise<Blob | null>;
}

/**
 * 일시정지를 붙인다. 두 에뮬레이터 모두 멈춘 동안에는 상태 저장 명령을 처리하지 않아서
 * (메뉴에서 나가기 → 자동 저장이 끝나지 않는다) 저장·불러오기 동안만 잠깐 풀었다가 다시 멈춘다.
 * 저장 중에 멈추라고 하면(앱이 뒤로 가서 자동 저장과 메뉴 열기가 같이 일어남) 저장이 끝난 뒤에 멈춘다
 */
export function pausable(raw: RawBridge): StateBridge {
  let paused = false;
  let inflight = 0;
  const running = async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (paused && !inflight) raw.resume();
    inflight++;
    try {
      return await fn();
    } finally {
      if (--inflight === 0 && paused) raw.pause();
    }
  };
  return {
    save: () => running(() => raw.save()),
    load: (state) => running(() => raw.load(state)),
    setFastForward: raw.setFastForward,
    reset: () => running(() => raw.reset()),
    screenshot: () => running(() => raw.screenshot()),
    setPaused(on) {
      if (on === paused) return;
      paused = on;
      if (inflight) return; // 저장·불러오기가 끝나면 running이 맞춰 준다
      if (on) raw.pause();
      else raw.resume();
    },
  };
}
