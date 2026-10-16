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
  parents?: string[];
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

/** 파일 목록 (여러 쪽이면 다 모은다). params에 q, fields(nextPageToken 포함)를 넣는다 */
export async function listAll(params: URLSearchParams): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken = "";
  do {
    if (pageToken) params.set("pageToken", pageToken);
    const r = (await (await call(`${API}/files?${params}`)).json()) as { files: DriveFile[]; nextPageToken?: string };
    out.push(...r.files);
    pageToken = r.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

export async function listChildren(parentId: string, extra = ""): Promise<DriveFile[]> {
  return listAll(
    new URLSearchParams({
      q: `'${q(parentId)}' in parents and trashed = false${extra ? ` and ${extra}` : ""}`,
      fields: `nextPageToken,files(${FIELDS})`,
      pageSize: "1000",
      spaces: "drive",
    }),
  );
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

// 이어 올리기 세션 주소를 기기에 적어 둔다. 휴대폰이 화면을 끄거나 다른 앱으로 가서 올리기가 끊겨도,
// 다음에 처음부터가 아니라 끊긴 지점부터 이어 올린다 (구글은 세션을 일주일 동안 받아 준다)
const sessionKey = (k: string) => `upload-session:${k}`;
const savedSession = (k?: string) => {
  try {
    return k ? (localStorage.getItem(sessionKey(k)) ?? undefined) : undefined;
  } catch {
    return undefined;
  }
};
const saveSession = (k: string | undefined, url: string | null) => {
  if (!k) return;
  try {
    if (url) localStorage.setItem(sessionKey(k), url);
    else localStorage.removeItem(sessionKey(k));
  } catch {
    // 못 적으면 끊겼을 때 그 파일만 처음부터 올린다
  }
};

/** 세션에 얼마나 올라갔는지 묻는다. 다 올라갔으면 파일, 세션이 사라졌으면 null */
async function sessionStatus(session: string, size: number): Promise<{ offset: number } | { file: DriveFile } | null> {
  try {
    const res = await call(session, { method: "PUT", headers: { "Content-Range": `bytes */${size}`, "X-GUploader-No-308": "yes" } });
    const status = Number(res.headers.get("X-HTTP-Status-Code-Override") ?? res.status);
    if (status !== 308) return { file: (await res.json()) as DriveFile };
    const range = res.headers.get("Range");
    return { offset: range ? Number(range.split("-")[1]) + 1 : 0 };
  } catch {
    return null; // 만료(404·410) 등: 새로 시작한다
  }
}

/**
 * 큰 파일 만들기: 이어 올리기 방식으로 조각내서 올린다.
 * resumeKey: 같은 파일이면 같은 값 (폴더·경로·크기). 끊겼던 세션이 남아 있으면 그 지점부터 잇는다
 */
export async function createLargeFile(
  parentId: string,
  name: string,
  data: Blob,
  appProperties: Record<string, string> | undefined,
  onProgress: (sent: number) => void,
  resumeKey?: string,
): Promise<DriveFile> {
  let session = savedSession(resumeKey) ?? null;
  let offset = 0;
  if (session) {
    const st = await sessionStatus(session, data.size);
    if (st && "file" in st) {
      saveSession(resumeKey, null);
      return st.file;
    }
    if (st) offset = st.offset;
    else session = null;
  }
  if (!session) {
    const start = await call(`${UPLOAD}/files?uploadType=resumable&fields=${FIELDS}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(data.size) },
      body: JSON.stringify({ name, parents: [parentId], ...(appProperties ? { appProperties } : {}) }),
    });
    session = start.headers.get("Location");
    if (!session) throw new Error("구글 드라이브 업로드를 시작하지 못했습니다");
    saveSession(resumeKey, session);
  }
  onProgress(offset);
  while (offset < data.size) {
    const end = Math.min(offset + CHUNK, data.size);
    // 브라우저 fetch는 308(이어서 보내라)을 리다이렉트로 처리하므로, 구글이 200으로 바꿔 주게 한다
    const res = await call(session, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${offset}-${end - 1}/${data.size}`, "X-GUploader-No-308": "yes" },
      body: data.slice(offset, end),
    });
    const status = Number(res.headers.get("X-HTTP-Status-Code-Override") ?? res.status);
    if (status !== 308) {
      saveSession(resumeKey, null);
      return (await res.json()) as DriveFile;
    }
    const range = res.headers.get("Range"); // 예: bytes=0-33554431
    offset = range ? Number(range.split("-")[1]) + 1 : end;
    onProgress(offset);
  }
  throw new Error("업로드가 끝나지 않았습니다");
}

export async function download(fileId: string): Promise<Response> {
  return call(`${API}/files/${fileId}?alt=media`);
}

/** 파일의 한 구간(start~end, 끝 포함)을 받는다. timeoutMs 안에 다 못 받으면 끊고 오류 (화면이 꺼져 연결이 멈춘 경우) */
export async function downloadRange(fileId: string, start: number, end: number, timeoutMs: number): Promise<Uint8Array> {
  const signal = AbortSignal.timeout(timeoutMs);
  const res = await call(`${API}/files/${fileId}?alt=media`, { headers: { Range: `bytes=${start}-${end}` }, signal });
  const data = new Uint8Array(await res.arrayBuffer());
  if (data.length !== end - start + 1) throw new Error("받은 크기가 맞지 않습니다");
  return data;
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
