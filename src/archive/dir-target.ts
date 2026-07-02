/**
 * Chat archive의 File System Access(디렉터리 직접 기록) 전담.
 *  - 폴더 핸들 선택/지속(IndexedDB)·권한
 *  - 폴더의 기존 chat-styles.css 읽기, 텍스트/이미지 파일 기록
 * Chromium 데스크톱 전용(feature-detect). 미지원 환경은 호출측이 옵션을 숨긴다.
 */
import { fetchImages } from "./util";

const DB_NAME = "sch-customize-archive";
const STORE = "handles";
const KEY = "archiveDir";

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbGet(key: string): Promise<any> {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
function idbSet(key: string, val: any): Promise<void> {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

export function isDirectoryPickerSupported(): boolean {
  return typeof (window as any).showDirectoryPicker === "function";
}

async function ensurePermission(handle: any): Promise<boolean> {
  const opts = { mode: "readwrite" };
  if ((await handle.queryPermission?.(opts)) === "granted") return true;
  if ((await handle.requestPermission?.(opts)) === "granted") return true;
  return false;
}

/**
 * 아카이브 폴더 핸들 확보. IndexedDB에 기억된 핸들 우선(권한 재확인), 없거나 거부면 picker.
 * **사용자 제스처 안에서 호출**해야 한다. 취소(AbortError)/실패 시 null.
 * (라이브 전용 — jsdom 미커버.)
 */
export async function getArchiveDirectory(): Promise<any | null> {
  try {
    const stored = await idbGet(KEY).catch(() => null);
    if (stored && (await ensurePermission(stored))) return stored;
    const handle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
    await idbSet(KEY, handle).catch(() => {});
    return handle;
  } catch (e) {
    if ((e as any)?.name === "AbortError") return null;
    console.warn("[sch-customize] getArchiveDirectory 실패:", e);
    return null;
  }
}

/** 폴더의 chat-styles.css 읽기. 없으면 null. */
export async function readExistingCss(dir: any): Promise<string | null> {
  try {
    const fh = await dir.getFileHandle("chat-styles.css");
    return await (await fh.getFile()).text();
  } catch (e) {
    if ((e as any)?.name === "NotFoundError") return null;
    console.warn("[sch-customize] 기존 css 읽기 실패:", e);
    return null;
  }
}

/** 폴더에 텍스트 파일 기록(덮어쓰기). */
export async function writeTextFile(dir: any, name: string, text: string): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

/** 폴더 하위폴더에 fetch한 이미지 기록(파일명 충돌 시 덮어씀). */
export async function writeImagesToDir(dir: any, imgSet: Iterable<string>, subfolder: string): Promise<void> {
  const sub = await dir.getDirectoryHandle(subfolder, { create: true });
  for (const { name, blob } of await fetchImages(imgSet)) {
    const fh = await sub.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
  }
}
