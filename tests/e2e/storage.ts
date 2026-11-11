import type { Page } from "@playwright/test";

export async function storedScore(page: Page, id: string) {
  return page.evaluate(async (scoreId) => {
    const request = indexedDB.open("music-score-platform");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const read = db.transaction("scores", "readonly").objectStore("scores").get(scoreId);
      const record = await new Promise<{ json: string } | undefined>((resolve, reject) => {
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
      return record ? JSON.parse(record.json) : null;
    } finally { db.close(); }
  }, id);
}

/** Raw IndexedDB envelope (json, revision, …) for no-write assertions. */
export async function storedRow(page: Page, id: string) {
  return page.evaluate(async (scoreId) => {
    const request = indexedDB.open("music-score-platform");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const read = db.transaction("scores", "readonly").objectStore("scores").get(scoreId);
      return await new Promise<unknown>((resolve, reject) => {
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
    } finally { db.close(); }
  }, id);
}
