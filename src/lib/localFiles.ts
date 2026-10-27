import type { FileAttachment, Tab } from './types';

const persistedFiles = new WeakSet<File>();
const fileIds = new WeakMap<File, string>();
export function localFileId(attachment: FileAttachment): string {
  if (attachment.fileId) return attachment.fileId;
  if (!attachment.file) return attachment.previewUrl;
  let id = fileIds.get(attachment.file);
  if (!id) { id = crypto.randomUUID(); fileIds.set(attachment.file, id); }
  return id;
}

function openFiles(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('meowhook-files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('File storage is blocked by another tab.'));
  });
}

export async function persistLocalFiles(tabs: Tab[]): Promise<void> {
  const files = tabs.flatMap(t => t.messages.flatMap(m => m._attachments ?? [])).filter(a => a.file && !persistedFiles.has(a.file));
  if (!files.length) return;
  const db = await openFiles();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      for (const attachment of files) tx.objectStore('files').put(attachment.file!, localFileId(attachment));
      tx.oncomplete = () => { files.forEach(a => persistedFiles.add(a.file!)); resolve(); };
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Could not save uploaded files.'));
    });
  } finally { db.close(); }
}

/** JSON snapshots retain file identity and names, never a stale browser blob URL. */
export function replaceLocalUrls<T>(value: T, urls: Map<string, string>): T {
  if (typeof value === 'string') return (urls.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map(v => replaceLocalUrls(v, urls)) as T;
  if (value && typeof value === 'object' && !(value instanceof Blob)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceLocalUrls(v, urls)])) as T;
  }
  return value;
}

export async function restoreLocalFiles(tabs: Tab[]): Promise<Tab[]> {
  const attachments = tabs.flatMap(t => t.messages.flatMap(m => m._attachments ?? []));
  const ids = [...new Set(attachments.filter(a => a.fileId).map(a => a.fileId!))];
  if (!ids.length) return tabs;
  const db = await openFiles();
  const files = new Map<string, File>();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      for (const id of ids) {
        const request = tx.objectStore('files').get(id);
        request.onsuccess = () => { if (request.result instanceof File) files.set(id, request.result); };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
  const urls = new Map([...files].map(([id, file]) => [`local-file:${id}`, URL.createObjectURL(file)]));
  return replaceLocalUrls(tabs, urls).map(tab => ({ ...tab, messages: tab.messages.map(message => {
    const restored = replaceLocalUrls(message, urls);
    return { ...restored, _attachments: restored._attachments?.map(a => ({ ...a, file: a.fileId ? files.get(a.fileId) : a.file })) };
  }) }));
}
