// 지금 모바일 데이터로 연결돼 있는지. 연결 종류는 안드로이드 Chrome만 알려 주므로 모르면 아니라고 본다.
interface Connection extends EventTarget {
  type?: string;
}

const connection = () => (navigator as Navigator & { connection?: Connection }).connection;

export const onCellular = () => connection()?.type === "cellular";

/** 연결이 바뀔 때마다 불린다 */
export function onNetworkChange(cb: () => void): () => void {
  const c = connection();
  c?.addEventListener("change", cb);
  return () => c?.removeEventListener("change", cb);
}
