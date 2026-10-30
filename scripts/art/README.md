# 그림 원본

- `icon-o.html`: 아이콘(주황 바탕 + 흰 고리). 로고(src/ui/Logo.tsx)의 O 자리 고리와 같은 모양. 브라우저 창을 정사각형으로 맞춰 찍으면 `public/*.png`가 된다: favicon 128·icon-192·icon-512는 `#round`(둥근 모서리), apple-touch-icon 180은 그대로(iOS가 깎는다), icon-maskable-512는 `#maskable`

찍은 PNG는 꼭 열어서 그림이 보이는지 확인한다 (about:blank 페이지에서 file:// 이미지를 불러오면 깨진 그림이 찍힌다).
