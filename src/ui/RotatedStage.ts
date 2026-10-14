// 기기 방향과 원하는 방향이 다를 때 게임 화면 전체(메뉴 포함)를 90도 돌린다
export function rotatedStyle(rotation: number): Record<string, string> | undefined {
  if (!rotation) return undefined;
  return {
    inset: "auto",
    left: "50%",
    top: "50%",
    width: "100vh",
    height: "100vw",
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
  };
}
