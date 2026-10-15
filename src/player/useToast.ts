// 화면 아래에 잠깐 떴다 사라지는 알림
import { useEffect, useRef, useState } from "preact/hooks";

export function useToast(ms = 2000): [string, (msg: string) => void] {
  const [text, setText] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = (msg: string) => {
    setText(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(""), ms);
  };
  return [text, show];
}
