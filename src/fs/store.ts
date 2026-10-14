// OPFS에 게임 파일과 세이브를 보관한다. 경로의 '/'는 디렉터리로 매핑된다.
export type FileMap = Map<string, Uint8Array>;

const root = () => navigator.storage.getDirectory();

async function dir(parts: string[], create: boolean): Promise<FileSystemDirectoryHandle | null> {
  let d = await root();
  for (const p of parts) {
    try {
      d = await d.getDirectoryHandle(p, { create });
    } catch {
      return null;
    }
  }
  return d;
}

export async function writeFile(path: string, data: Uint8Array | Blob) {
  const parts = path.split("/");
  const d = (await dir(parts.slice(0, -1), true))!;
  const w = await (await d.getFileHandle(parts[parts.length - 1], { create: true })).createWritable();
  await w.write(data);
  await w.close();
}

export async function readDir(path: string): Promise<FileMap | null> {
  const d = await dir(path.split("/"), false);
  if (!d) return null;
  const out: FileMap = new Map();
  const walk = async (h: FileSystemDirectoryHandle, prefix: string) => {
    for await (const [name, child] of (h as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (child.kind === "directory") await walk(child as FileSystemDirectoryHandle, `${prefix}${name}/`);
      else out.set(prefix + name, new Uint8Array(await (await (child as FileSystemFileHandle).getFile()).arrayBuffer()));
    }
  };
  await walk(d, "");
  return out;
}

export async function exists(path: string): Promise<boolean> {
  const parts = path.split("/");
  const d = await dir(parts.slice(0, -1), false);
  if (!d) return false;
  return d.getFileHandle(parts[parts.length - 1]).then(() => true, () => false);
}

export async function removeFile(path: string) {
  const parts = path.split("/");
  const d = await dir(parts.slice(0, -1), false);
  await d?.removeEntry(parts[parts.length - 1]).catch(() => undefined);
}

export async function removeDir(path: string) {
  await (await root()).removeEntry(path, { recursive: true }).catch(() => undefined);
}
