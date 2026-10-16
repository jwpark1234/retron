// 스크린샷 저장: 기종 해상도 그대로면 너무 작아서(SFC 256×224) 도트가 뭉개지지 않게 정수배로 키워 PNG로 내려받는다.
import { download } from "../library/backup";

const MIN_WIDTH = 1024;

async function scaleUp(png: Blob): Promise<Blob> {
  const img = await createImageBitmap(png);
  const k = Math.max(1, Math.ceil(MIN_WIDTH / img.width));
  if (k === 1) return png;
  const canvas = document.createElement("canvas");
  canvas.width = img.width * k;
  canvas.height = img.height * k;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? png), "image/png"));
}

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

export async function saveScreenshot(title: string, png: Blob) {
  download(`${title}-${stamp()}.png`, await scaleUp(png));
}
