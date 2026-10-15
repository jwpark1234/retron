// 썸네일: 1:1로 가운데를 잘라 PNG로 만든다. 게임의 .ico가 있으면 그것을, 없으면 첫 실행 화면을 쓴다.
import { gameDir, saveThumbnail } from "./library";
import { getFile } from "./store";

const SIZE = 256;

export async function squarePng(src: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const side = Math.min(width, height);
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = side >= SIZE; // 작은 아이콘은 도트 그대로 키운다
  ctx.drawImage(src, (width - side) / 2, (height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG 변환 실패"))), "image/png"));
}

/** 브라우저가 읽을 수 있는 이미지(.ico, .png 등) → 1:1 PNG */
export async function imageFileToSquare(file: Blob): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await squarePng(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 밝은 점의 비율 (0~1). 화면 전환 중 검은 화면은 썸네일로 쓰지 않으려고 본다 */
export function litFractionOf(src: CanvasImageSource, width: number, height: number): number {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, width, height, 0, 0, 64, 64);
  const d = ctx.getImageData(0, 0, 64, 64).data;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 48) lit++;
  return lit / (64 * 64);
}

export async function litFraction(png: Blob): Promise<number> {
  const bmp = await createImageBitmap(png);
  try {
    return litFractionOf(bmp, bmp.width, bmp.height);
  } finally {
    bmp.close();
  }
}

export async function hasThumbnail(id: string) {
  return !!(await getFile(`${gameDir(id)}/thumb.png`));
}

/** 첫 실행 캡처: 썸네일이 아직 없을 때만 저장한다 */
export async function saveFirstRunThumbnail(id: string, png: Blob) {
  if (await hasThumbnail(id)) return;
  await saveThumbnail(id, png);
}

const stem = (p: string) => p.split("/").pop()!.replace(/\.[^.]+$/, "").toUpperCase();

/** 게임을 대표하는 .ico를 고른다: 실행 파일이나 게임 폴더와 이름이 맞는 것만 (AI_CTRL.ICO 같은 건 제외) */
export function pickIcon(paths: string[], exePath: string): string | undefined {
  const exe = stem(exePath);
  const folder = exePath.split("/").slice(-2, -1)[0]?.toUpperCase() ?? "";
  const score = (p: string) => {
    const s = stem(p);
    if (s === exe || s === folder) return 3;
    if (s.startsWith(exe) || exe.startsWith(s) || (folder && (s.startsWith(folder) || folder.startsWith(s)))) return 2;
    return 0;
  };
  return paths
    .filter((p) => /\.ico$/i.test(p))
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)[0]?.p;
}
