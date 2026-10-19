// 메뉴에서 쓰는 선 아이콘 (24×24, currentColor)
import type { ComponentChildren } from "preact";

function Svg({ children }: { children: ComponentChildren }) {
  return (
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconClose = () => (
  <Svg>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const IconExit = () => (
  <Svg>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </Svg>
);

export const IconFullscreen = ({ on }: { on: boolean }) => (
  <Svg>
    {on ? (
      <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
    ) : (
      <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
    )}
  </Svg>
);

export const IconMonitor = () => (
  <Svg>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </Svg>
);

export const IconGamepad = () => (
  <Svg>
    <rect x="2" y="6" width="20" height="12" rx="3" />
    <path d="M6 12h4M8 10v4M15 13h.01M18 11h.01" />
  </Svg>
);

export const IconMenu = () => (
  <Svg>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const IconFastForward = () => (
  <Svg>
    <path d="M3 6.5v11l8-5.5zM12 6.5v11l8-5.5z" fill="currentColor" />
  </Svg>
);

/** 트랙패드 표시: 마우스 */
export const IconMouse = () => (
  <Svg>
    <rect x="6" y="3" width="12" height="18" rx="6" />
    <path d="M12 3v6M6 9h12" />
  </Svg>
);

export const IconRestart = () => (
  <Svg>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Svg>
);

export const IconCamera = () => (
  <Svg>
    <path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13" r="4" />
  </Svg>
);

/** 드라이브에서 받기 */
export const IconDownload = () => (
  <Svg>
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M5 21h14" />
  </Svg>
);
