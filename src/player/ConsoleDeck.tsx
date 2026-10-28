// 휴대폰 세로 화면 조작 영역의 빈자리에 넣는 게임기 몸체 장식: 전원 램프, 이름, 스피커 구멍. 누를 수 없다.
// 몸체 색은 기종마다 style.css가 정한다 (.game[data-platform]). 자리가 좁으면 스피커부터 숨는다
export function ConsoleDeck({ model }: { model: string }) {
  return (
    <div class="deck" aria-hidden="true">
      <div class="deck-name">
        <span class="deck-led" />
        <strong>RETRON</strong>
        <small>{model}</small>
      </div>
      <div class="deck-grille" />
    </div>
  );
}
