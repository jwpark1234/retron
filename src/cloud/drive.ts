// 구글 드라이브 REST API (v3)를 브라우저에서 직접 부른다.
import { accessToken } from "./google-auth";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
const FIELDS = "id,name,size,mimeType,appProperties,modifiedTime,version";
const CHUNK = 32 * 1024 * 1024; // 이어 올리기 조각 (256KB의 배수)

export interface DriveFile {
  id: string;
  name: string;
  size?: string;
  mimeType: string;
  appProperties?: Record<string, string>;
  modifiedTime: string;
  version: string;
}

async function call(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await accessToken()}` } });
  if (!res.ok && res.status !== 308) {
    let msg = `${res.status}`;
    try {
      msg = ((await res.json()) as { error: { message: string } }).error.message;
    } catch {
      // 본문이 JSON이 아니다
    }
    if (res.status === 403 && /quota|storage/i.test(msg)) throw new Error("구글 드라이브 저장 공간이 부족합니다");
    throw new Error(`구글 드라이브 오류: ${msg}`);
  }
  return res;
}

const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export async function listChildren(parentId: string, extra = ""): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: `'${q(parentId)}' in parents and trashed = false${extra ? ` and ${extra}` : ""}`,
      fields: `nextPageToken,files(${FIELDS})`,
      pageSize: "1000",
      spaces: "drive",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const r = (await (await call(`${API}/files?${params}`)).json()) as { files: DriveFile[]; nextPageToken?: string };
    out.push(...r.files);
    pageToken = r.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

export async function findChild(parentId: string, name: string): Promise<DriveFile | undefined> {
  return (await listChildren(parentId, `name = '${q(name)}'`))[0];
}

export async function ensureFolder(parentId: string, name: string): Promise<string> {
  const found = await findChild(parentId, name);
  if (found) return found.id;
  const res = await call(`${API}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }),
  });
  return ((await res.json()) as { id: string }).id;
}

/** 작은 파일 만들기 (5MB 이하 권장) */
export async function createFile(parentId: string, name: string, data: Blob, appProperties?: Record<string, string>): Promise<DriveFile> {
  const meta = { name, parents: [parentId], ...(appProperties ? { appProperties } : {}) };
  const body = new FormData();
  body.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
  body.append("file", data);
  const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, { method: "POST", body });
  return (await res.json()) as DriveFile;
}

/** 파일 내용 바꾸기 */
export async function updateFile(fileId: string, data: Blob): Promise<DriveFile> {
  const res = await call(`${UPLOAD}/files/${fileId}?uploadType=media&fields=${FIELDS}`, { method: "PATCH", body: data });
  return (await res.json()) as DriveFile;
}

/** 큰 파일 만들기: 이어 올리기 방식으로 조각내서 올린다 */
export async function createLargeFile(
  parentId: string,
  name: string,
  data: Blob,
  appProperties: Record<string, string> | undefined,
  onProgress: (sent: number) => void,
): Promise<DriveFile> {
  const start = await call(`${UPLOAD}/files?uploadType=resumable&fields=${FIELDS}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(data.size) },
    body: JSON.stringify({ name, parents: [parentId], ...(appProperties ? { appProperties } : {}) }),
  });
  const session = start.headers.get("Location");
  if (!session) throw new Error("구글 드라이브 업로드를 시작하지 못했습니다");
  for (let offset = 0; offset < data.size; ) {
    const end = Math.min(offset + CHUNK, data.size);
    // 브라우저 fetch는 308(이어서 보내라)을 리다이렉트로 처리하므로, 구글이 200으로 바꿔 주게 한다
    const res = await call(session, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${offset}-${end - 1}/${data.size}`, "X-GUploader-No-308": "yes" },
      body: data.slice(offset, end),
    });
    const status = Number(res.headers.get("X-HTTP-Status-Code-Override") ?? res.status);
    if (status !== 308) return (await res.json()) as DriveFile;
    const range = res.headers.get("Range"); // 예: bytes=0-33554431
    offset = range ? Number(range.split("-")[1]) + 1 : end;
    onProgress(offset);
  }
  throw new Error("업로드가 끝나지 않았습니다");
}

export async function download(fileId: string): Promise<Response> {
  return call(`${API}/files/${fileId}?alt=media`);
}

export async function getMeta(fileId: string): Promise<DriveFile> {
  return (await (await call(`${API}/files/${fileId}?fields=${FIELDS}`)).json()) as DriveFile;
}

/** 휴지통으로 보낸다 (30일 안에 드라이브에서 되살릴 수 있다) */
export async function trash(fileId: string) {
  await call(`${API}/files/${fileId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}

export async function rootFolder(name: string): Promise<string> {
  return ensureFolder("root", name);
}
