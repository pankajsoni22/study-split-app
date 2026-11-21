// Local autosave (docs §6.4): unsaved editor state is kept in IndexedDB so a crash, a closed tab or a
// lost connection never loses work. Zero network. Fails silently when IndexedDB is unavailable.

import type { Doc } from '../domain/content.ts';
import type { ArticleMeta, CanvasScene } from '../domain/types.ts';

export interface LocalDraft {
  articleId: string;
  /** Server version the edits were based on. */
  baseVersion: number;
  savedAt: number;
  doc: Doc;
  canvas: CanvasScene;
  meta: ArticleMeta;
}

const DB = 'study-split';
const STORE = 'drafts';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'articleId' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { resolve(req.result as T | undefined); db.close(); };
      tx.onerror = () => { reject(tx.error ?? new Error('IndexedDB error')); db.close(); };
    });
  } catch {
    return undefined;
  }
}

export const localDrafts = {
  get: (articleId: string) => run<LocalDraft>('readonly', s => s.get(articleId)),
  put: (draft: LocalDraft) => run<IDBValidKey>('readwrite', s => s.put(draft)).then(() => undefined),
  remove: (articleId: string) => run<undefined>('readwrite', s => s.delete(articleId)).then(() => undefined)
};
