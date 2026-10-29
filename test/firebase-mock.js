// =============================================================
// In-memory stand-in for the Firebase compat SDK, injected into the
// page before app.js runs so the cloud code paths can be tested
// without a live Firebase project.
//
// Models only what the app uses: auth state, doc get/set/delete,
// onSnapshot, collection get, where/orderBy/limit queries and batched
// writes. State lives in sessionStorage so it survives a reload.
//
// Test hooks: window.__fb.DB, window.__fb.remoteSet(path, data)
// (simulates another device writing), window.__fb.calls.
// =============================================================
(() => {
  // persisted in sessionStorage so a page reload keeps the "server" state
  const load = k => { try { return JSON.parse(sessionStorage.getItem(k)) || null; } catch { return null; } };
  const DB = Object.assign(Object.create(null), load('__fbdb') || {});
  const save = () => sessionStorage.setItem('__fbdb', JSON.stringify(DB));
  const subs = [];
  window.__fb = { DB, calls: [] };
  const log = (...a) => window.__fb.calls.push(a.join(' '));
  const clone = v => JSON.parse(JSON.stringify(v));
  const DOC_ID = { __docId: true };

  const snap = (path, data, pending = false) => ({
    id: path.split('/').pop(), exists: data !== undefined,
    data: () => clone(data), metadata: { hasPendingWrites: pending },
  });
  const notify = path => subs.filter(s => s.path === path).forEach(s => s.cb(snap(path, DB[path])));

  function docRef(path) {
    return {
      id: path.split('/').pop(), path,
      collection: c => collRef(path + '/' + c),
      get: async () => { log('get', path); return snap(path, DB[path]); },
      set: async (data, opts) => {
        log('set', path);
        if (data && typeof data === 'object') for (const k of Object.keys(data)) if (data[k] && data[k].__ts) data[k] = Date.now();
        DB[path] = opts && opts.merge ? { ...(DB[path] || {}), ...clone(data) } : clone(data);
        save(); notify(path);
      },
      delete: async () => { log('delete', path); delete DB[path]; save(); notify(path); },
      onSnapshot: (cb, errCb) => {
        const s = { path, cb, errCb };
        subs.push(s);
        setTimeout(() => cb(snap(path, DB[path])), 0);
        return () => subs.splice(subs.indexOf(s), 1);
      },
    };
  }

  function query(coll, filters = [], order = null, lim = 0) {
    const run = () => {
      let docs = Object.keys(DB)
        .filter(p => p.startsWith(coll + '/') && p.slice(coll.length + 1).indexOf('/') === -1)
        .map(p => snap(p, DB[p]));
      for (const [field, op, val] of filters) {
        const get = d => (field === DOC_ID || field.__docId ? d.id : DB[coll + '/' + d.id][field]);
        docs = docs.filter(d => {
          const v = get(d);
          return op === '>=' ? v >= val : op === '<=' ? v <= val : op === '==' ? v === val : true;
        });
      }
      if (order) docs.sort((a, b) => (order[1] === 'desc' ? -1 : 1) * ((DB[coll + '/' + a.id][order[0]] ?? 0) < (DB[coll + '/' + b.id][order[0]] ?? 0) ? -1 : 1));
      if (lim) docs = docs.slice(0, lim);
      return docs;
    };
    return {
      where: (f, o, v) => query(coll, [...filters, [f, o, v]], order, lim),
      orderBy: (f, d) => query(coll, filters, [f, d], lim),
      limit: n => query(coll, filters, order, n),
      get: async () => { log('query', coll); const docs = run(); return { docs, empty: !docs.length, size: docs.length, forEach: f => docs.forEach(f) }; },
    };
  }

  function collRef(path) {
    return Object.assign(query(path), {
      doc: id => docRef(path + '/' + (id || 'auto' + Math.random().toString(36).slice(2, 8))),
      add: async data => { const r = docRef(path + '/auto' + Math.random().toString(36).slice(2, 8)); await r.set(data); return r; },
    });
  }

  let user = load('__fbuser');
  const authSubs = [];
  const fire = () => { sessionStorage.setItem('__fbuser', JSON.stringify(user)); authSubs.forEach(cb => cb(user)); };
  // test hook: write straight to the "server" as if another device did it
  window.__fb.remoteSet = (path, data) => { DB[path] = clone(data); save(); notify(path); };

  window.firebase = {
    initializeApp: () => {},
    auth: Object.assign(() => ({
      onAuthStateChanged: cb => { authSubs.push(cb); setTimeout(() => cb(user), 0); return () => {}; },
      getRedirectResult: async () => ({ user: null }),
      signInWithEmailAndPassword: async (email) => { user = { uid: 'u1', email, displayName: null }; fire(); return { user }; },
      createUserWithEmailAndPassword: async (email) => {
        user = { uid: 'u1', email, displayName: null };
        user.updateProfile = async pr => { user.displayName = pr.displayName; fire(); };
        fire(); return { user };
      },
      signInWithPopup: async () => { user = { uid: 'u1', email: 'g@x.com', displayName: 'Google User' }; fire(); return { user }; },
      signInWithRedirect: async () => {},
      sendPasswordResetEmail: async () => {},
      signOut: async () => { user = null; fire(); },
    }), { GoogleAuthProvider: function () {} }),
    firestore: Object.assign(() => ({
      enablePersistence: async () => {},
      collection: collRef,
      batch: () => {
        const ops = [];
        return { set: (ref, data, opts) => ops.push([ref, data, opts]), commit: async () => { for (const [r, d, o] of ops) await r.set(d, o); } };
      },
    }), {
      FieldValue: { serverTimestamp: () => ({ __ts: true }) },
      FieldPath: { documentId: () => DOC_ID },
    }),
  };
})();
