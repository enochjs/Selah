import type { DocumentPickerAsset } from "expo-document-picker";
const cachedUrls = new Map<string, string>();
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("selah-audio-library", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("audio");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveAudio(
  asset: DocumentPickerAsset,
  id: string,
): Promise<string> {
  const blob = asset.file ?? (await (await fetch(asset.uri)).blob());
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("audio", "readwrite");
      tx.objectStore("audio").put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  return `library:${id}`;
}
export async function audioUri(uri: string): Promise<string> {
  if (!uri.startsWith("library:")) return uri;
  if (cachedUrls.has(uri)) return cachedUrls.get(uri)!;
  const db = await database();
  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      const req = db
        .transaction("audio")
        .objectStore("audio")
        .get(uri.slice(8));
      req.onsuccess = () =>
        req.result
          ? resolve(req.result)
          : reject(new Error("Audio file not found"));
      req.onerror = () => reject(req.error);
    });
    const url = URL.createObjectURL(blob);
    cachedUrls.set(uri, url);
    return url;
  } finally {
    db.close();
  }
}
export async function deleteAudio(uri: string): Promise<void> {
  if (!uri.startsWith("library:")) return;
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("audio", "readwrite");
      tx.objectStore("audio").delete(uri.slice(8));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  const url = cachedUrls.get(uri);
  if (url) {
    URL.revokeObjectURL(url);
    cachedUrls.delete(uri);
  }
}
