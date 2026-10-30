# 그림 원본

- `icon-crt.html`: 아이콘(어두운 바탕 + 화면에 RETRON이 켜진 CRT 모니터). SVG는 로고(src/ui/Logo.tsx 큰 로고)를 그대로 옮긴 것이라 로고를 바꾸면 다시 옮긴다. 크롬 헤드리스로 512×512 창을 찍으면 `public/*.png`가 된다: favicon 128·icon-192·icon-512는 `#round`(둥근 모서리), apple-touch-icon 180은 그대로(iOS가 깎는다), icon-maskable-512는 `#maskable`. 512보다 작은 것은 창을 줄이지 말고 `--force-device-scale-factor`로 줄인다 (헤드리스 창은 최소 크기가 있어서 작은 창은 잘려 찍힌다)

찍은 PNG는 꼭 열어서 그림이 보이는지 확인한다 (about:blank 페이지에서 file:// 이미지를 불러오면 깨진 그림이 찍힌다).
