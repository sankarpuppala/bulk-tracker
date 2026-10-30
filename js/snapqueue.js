// =============================================================
// SNAP QUEUE — photos taken offline wait here (IndexedDB) and are
// analysed when the connection is back. Already resized, so a queued
// photo is a few hundred KB. Every call is best-effort: with no
// IndexedDB (private window, old browser) the queue is simply empty.
// =============================================================
const DB = 'ff-snap', STORE = 'queue';

function open() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no indexedDB'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const tx = async (mode, fn) => {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), out = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); res(out?.result); };
    t.onerror = () => { db.close(); rej(t.error); };
  });
};

/** entry: { mode, base64, meal } */
export async function enqueue(entry) {
  try { const row = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), ts: Date.now(), ...entry }; await tx('readwrite', s => s.put(row)); return row.id; }
  catch { return null; }
}
export async function queued() { try { return (await tx('readonly', s => s.getAll())) || []; } catch { return []; } }
export async function dequeue(id) { try { await tx('readwrite', s => s.delete(id)); } catch { /* ignore */ } }
