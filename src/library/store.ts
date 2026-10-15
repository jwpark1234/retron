// OPFS 래퍼. 경로의 '/'는 디렉터리로 매핑된다.
export type FileMap = Map<string, Uint8Array>;

const root = () => navigator.storage.getDirectory();

async function dir(parts: string[], create: boolean): Promise<FileSystemDirectoryHandle | null> {
  let d = await root();
  for (const p of parts.filter(Boolean)) {
    try {
      d = await d.getDirectoryHandle(p, { create });
    } catch {
      return null;
    }
  }
  return d;
}

const split = (path: string) => {
  const parts = path.split("/");
  return { dirs: parts.slice(0, -1), name: parts[parts.length - 1] };
};

export async function writeFile(path: string, data: Uint8Array | Blob) {
  const { dirs, name } = split(path);
  const d = (await dir(dirs, true))!;
  const w = await (await d.getFileHandle(name, { create: true })).createWritable();
  await w.write(data);
  await w.close();
}

/** 디스크에 있는 그대로의 File을 돌려준다 (메모리에 올리지 않음). */
export async function getFile(path: string): Promise<File | null> {
  const { dirs, name } = split(path);
  const d = await dir(dirs, false);
  if (!d) return null;
  return d.getFileHandle(name).then((h) => h.getFile(), () => null);
}

/** 디렉터리 아래 모든 파일을 상대경로 → File로 나열한다. */
export async function listFiles(path: string): Promise<Map<string, File>> {
  const out = new Map<string, File>();
  const d = await dir(path.split("/"), false);
  if (!d) return out;
  const walk = async (h: FileSystemDirectoryHandle, prefix: string) => {
    for await (const [name, child] of (h as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (child.kind === "directory") await walk(child as FileSystemDirectoryHandle, `${prefix}${name}/`);
      else out.set(prefix + name, await (child as FileSystemFileHandle).getFile());
    }
  };
  await walk(d, "");
  return out;
}

/** 디렉터리 바로 아래 하위 디렉터리 이름들 */
export async function listDirs(path: string): Promise<string[]> {
  const d = await dir(path.split("/"), false);
  if (!d) return [];
  const out: string[] = [];
  for await (const [name, child] of (d as any).entries() as AsyncIterable<[string, FileSystemHandle]>) if (child.kind === "directory") out.push(name);
  return out;
}

export async function readDir(path: string): Promise<FileMap> {
  const out: FileMap = new Map();
  for (const [p, f] of await listFiles(path)) out.set(p, new Uint8Array(await f.arrayBuffer()));
  return out;
}

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  const f = await getFile(path);
  return f ? (JSON.parse(await f.text()) as T) : fallback;
}

export async function writeJson(path: string, value: unknown) {
  await writeFile(path, new TextEncoder().encode(JSON.stringify(value)));
}

export async function removeFile(path: string) {
  const { dirs, name } = split(path);
  const d = await dir(dirs, false);
  await d?.removeEntry(name).catch(() => undefined);
}

export async function removeDir(path: string) {
  const { dirs, name } = split(path);
  const d = await dir(dirs, false);
  await d?.removeEntry(name, { recursive: true }).catch(() => undefined);
}

/** 조각으로 나눠 쓸 파일을 연다 (큰 파일을 메모리에 모으지 않으려고) */
export async function openWritable(path: string): Promise<FileSystemWritableFileStream> {
  const { dirs, name } = split(path);
  const d = (await dir(dirs, true))!;
  return (await d.getFileHandle(name, { create: true })).createWritable();
}

/** 내려받는 스트림을 메모리에 다 올리지 않고 바로 쓴다 */
export async function writeStream(path: string, stream: ReadableStream<Uint8Array>) {
  const { dirs, name } = split(path);
  const d = (await dir(dirs, true))!;
  const w = await (await d.getFileHandle(name, { create: true })).createWritable();
  await stream.pipeTo(w);
}

const GB = (n: number) => `${(n / 1024 ** 3).toFixed(1)}GB`;

/** 저장 공간이 모자라서 난 오류면 얼마나 쓰고 있는지 알려 주는 말로 바꾼다 */
export async function explainError(e: unknown): Promise<string> {
  const msg = (e as Error)?.message ?? String(e);
  if ((e as DOMException)?.name !== "QuotaExceededError" && !/quota/i.test(msg)) return msg;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate().catch(() => ({}) as StorageEstimate);
  return `브라우저 저장 공간이 모자랍니다 (${GB(usage)} / ${GB(quota)} 사용). 안 하는 게임을 지우거나, 브라우저가 있는 드라이브(C:)의 빈 공간을 늘려 주세요.`;
}
