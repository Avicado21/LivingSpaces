/* livingSpaces HTTP API + static front end. createApp() takes its database and
   AI client as arguments so tests can run it with SQLite in memory and a fake
   Claude. */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { CATEGORY_IDS, isCategory, catLong } from '../shared/categories.js';
import { nets, settleUp, buyout, splitError, stakes, suggestedValue, money } from '../shared/ledger.js';
import { CHAD_SYSTEM, explainError, normaliseScores } from './ai.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.wasm': 'application/wasm', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_PNG_BYTES = 5e6;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const fail = (status, code, message) => Object.assign(new Error(message), { http: status, code });

export function createApp({ db, ai, staticDir = null, now = () => new Date(), log = () => {} }) {
  const todayISO = () => now().toISOString().slice(0, 10);

  async function body(req, limit) {
    let size = 0; const chunks = [];
    for await (const c of req) { size += c.length; if (size > limit) throw fail(413, 'too_large', 'Request body too large'); chunks.push(c); }
    if (!size) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail(400, 'bad_json', 'Body must be JSON'); }
  }
  function send(res, status, obj) { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); }
  function household() { const h = db.household(); if (!h) throw fail(404, 'no_household', 'Set up your household first'); return h; }
  function roommateIds(hid) { return db.roommates(hid).map(r => String(r.id)); }
  function requireRoommate(hid, id, field = 'roommate') { if (!roommateIds(hid).includes(String(id))) throw fail(400, 'bad_roommate', `Unknown ${field}`); return String(id); }
  function decodePng(b64) {
    if (typeof b64 !== 'string' || !b64) throw fail(400, 'bad_image', 'Expected a base64 PNG in "image"');
    const buf = Buffer.from(b64.replace(/^data:image\/png;base64,/, ''), 'base64');
    if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_MAGIC)) throw fail(400, 'bad_image', 'The photo must be a PNG (the app converts phone photos before upload)');
    if (buf.length > MAX_PNG_BYTES) throw fail(413, 'too_large', 'The PNG is too large');
    return buf;
  }

  /* everything the UI needs to draw the room, the bills tab and the ledger */
  function state() {
    const h = household();
    const roommates = db.roommates(h.id), ids = roommates.map(r => String(r.id));
    const all = db.items(h.id).map(i => ({ ...i, photoUrl: i.hasPhoto ? `/api/items/${i.id}/photo` : null }));
    const items = all.filter(i => !i.movedOutAt), movedOut = all.filter(i => i.movedOutAt);
    const bills = db.bills(h.id), buyouts = db.buyouts(h.id);
    const net = nets(ids, bills, buyouts);
    return { household: h, today: todayISO(), roommates, items, movedOut, bills, buyouts, net, transfers: settleUp(net), stakes: stakes(ids, items) };
  }

  /* Chad's view of the household: names and dollars, nothing else */
  function ledgerForChad(s, meId) {
    const name = id => s.roommates.find(r => String(r.id) === String(id))?.name ?? 'someone';
    const dollars = c => money(c);
    const paid = sp => Object.fromEntries(Object.entries(sp).map(([id, v]) => [name(id), dollars(v)]));
    const perType = {};
    for (const i of s.items) perType[i.category] = (perType[i.category] || 0) + 1;
    return {
      today: s.today, you: name(meId), household: s.household.name, roommates: s.roommates.map(r => r.name),
      itemsInRoom: s.items.map(i => ({ name: i.name, type: catLong(i.category), price: dollars(i.price), bought: i.purchaseDate, paid: paid(i.splits), sameTypeInRoom: perType[i.category], suggestedValueNow: dollars(suggestedValue(i.price, i.purchaseDate, now()).value) })),
      movedOut: s.movedOut.map(i => ({ name: i.name, keptBy: name(i.keptBy), agreedValue: dollars(i.buyoutValue ?? i.price) })),
      bills: s.bills.map(b => ({ name: b.name, kind: b.kind, amount: dollars(b.amount), paidBy: name(b.paidBy), splitAmong: b.among.map(name), date: b.date })),
      moveOutBuyouts: s.buyouts.map(b => ({ item: b.itemName, from: name(b.from), to: name(b.to), amount: dollars(b.amount) })),
      whoOwesWhomNow: s.transfers.map(t => ({ from: name(t.from), to: name(t.to), amount: dollars(t.amount) })),
    };
  }

  const routes = {
    'GET /api/health': async (req, res) => {
      try { const c = await ai.checkCredentials(); send(res, 200, { ok: true, ...ai.info, credentialsExpire: c.expiration }); }
      catch (err) { send(res, 200, { ok: false, ...ai.info, error: explainError(err, ai.info.profile) }); }
    },
    'GET /api/household': async (req, res) => {
      const h = db.household();
      send(res, 200, { household: h, roommates: h ? db.roommates(h.id) : [] });
    },
    'POST /api/household': async (req, res) => {
      if (db.household()) throw fail(409, 'exists', 'A household already exists');
      const b = await body(req, 1e4);
      const name = String(b.name || '').trim().slice(0, 60);
      const names = [...new Set((Array.isArray(b.roommates) ? b.roommates : []).map(n => String(n).trim().slice(0, 30)).filter(Boolean))];
      if (!name) throw fail(400, 'bad_name', 'Give the household a name');
      if (!names.length) throw fail(400, 'bad_roommates', 'Add at least one roommate');
      const hid = db.createHousehold(name, names);
      send(res, 201, { household: db.household(), roommates: db.roommates(hid) });
    },
    'POST /api/roommates': async (req, res) => {
      const h = household(), b = await body(req, 1e4);
      const name = String(b.name || '').trim().slice(0, 30);
      if (!name) throw fail(400, 'bad_name', 'Roommate needs a name');
      if (db.roommates(h.id).some(r => r.name.toLowerCase() === name.toLowerCase())) throw fail(409, 'exists', `${name} is already in the household`);
      send(res, 201, db.addRoommate(h.id, name));
    },
    'GET /api/state': async (req, res) => send(res, 200, state()),

    'POST /api/classify': async (req, res) => {
      household();
      const b = await body(req, 8e6);
      const png = decodePng(b.image);
      const cats = Array.isArray(b.categories) && b.categories.length ? [...new Set(b.categories)].filter(isCategory) : CATEGORY_IDS;
      if (cats.length < 2) throw fail(400, 'bad_categories', 'Need at least two known categories');
      const r = await ai.classify({ pngBase64: png.toString('base64'), categories: cats });
      if (!cats.includes(r.raw?.category)) throw fail(502, 'bad_output', `The classifier returned an unknown category "${r.raw?.category}"`);
      const scores = normaliseScores(cats, r.raw.scores);
      send(res, 200, {
        category: r.raw.category, confidence: scores[r.raw.category], scores,
        suggestedName: String(r.raw.suggestedName || '').slice(0, 60), reason: String(r.raw.reason || '').slice(0, 160),
        model: r.model, ms: r.ms,
      });
    },

    'POST /api/items': async (req, res) => {
      const h = household(), b = await body(req, 8e6);
      if (!isCategory(b.category)) throw fail(400, 'bad_category', 'Unknown category');
      const name = String(b.name || '').trim().slice(0, 60);
      if (!name) throw fail(400, 'bad_name', 'Give it a name');
      if (!ISO_DATE.test(String(b.purchaseDate || ''))) throw fail(400, 'bad_date', 'Purchase date must be YYYY-MM-DD');
      const ids = roommateIds(h.id), splits = {};
      for (const [k, v] of Object.entries(b.splits || {})) splits[String(k)] = v;
      const err = splitError(b.price, splits, ids);
      if (err) throw fail(400, 'bad_split', err);
      const photo = b.image ? decodePng(b.image) : null;
      const createdBy = b.createdBy != null && ids.includes(String(b.createdBy)) ? Number(b.createdBy) : null;
      const id = db.createItem(h.id, {
        category: b.category, name, price: b.price, purchaseDate: b.purchaseDate, splits, photo, createdBy,
        aiCategory: isCategory(b.aiCategory) ? b.aiCategory : null, aiConfidence: Number.isFinite(b.aiConfidence) ? b.aiConfidence : null,
      });
      const item = db.item(h.id, id);
      send(res, 201, { ...item, photoUrl: item.hasPhoto ? `/api/items/${id}/photo` : null });
    },

    'POST /api/bills': async (req, res) => {
      const h = household(), b = await body(req, 1e4);
      const name = String(b.name || '').trim().slice(0, 60);
      if (!name) throw fail(400, 'bad_name', 'What was the bill for?');
      if (!Number.isInteger(b.amount) || b.amount <= 0) throw fail(400, 'bad_amount', 'Amount must be a positive number of cents');
      const paidBy = requireRoommate(h.id, b.paidBy, 'payer');
      const among = [...new Set((b.among || []).map(String))];
      if (!among.length) throw fail(400, 'bad_split', 'Split it with at least one roommate');
      among.forEach(id => requireRoommate(h.id, id));
      const date = ISO_DATE.test(String(b.date || '')) ? b.date : todayISO();
      const kind = ['rent', 'utility', 'wifi', 'groceries', 'bill'].includes(b.kind) ? b.kind : 'bill';
      const id = db.createBill(h.id, { name, amount: b.amount, paidBy, among, date, kind });
      send(res, 201, db.bills(h.id).find(x => x.id === id));
    },
    'POST /api/payments': async (req, res) => {
      const h = household(), b = await body(req, 1e4);
      const from = requireRoommate(h.id, b.from, 'payer'), to = requireRoommate(h.id, b.to, 'payee');
      if (from === to) throw fail(400, 'bad_payment', "Can't pay yourself");
      if (!Number.isInteger(b.amount) || b.amount <= 0) throw fail(400, 'bad_amount', 'Amount must be a positive number of cents');
      const names = Object.fromEntries(db.roommates(h.id).map(r => [String(r.id), r.name]));
      const id = db.createBill(h.id, { name: `${names[from]} paid ${names[to]}`, amount: b.amount, paidBy: from, among: [to], date: todayISO(), kind: 'payment' });
      send(res, 201, db.bills(h.id).find(x => x.id === id));
    },

    'GET /api/chat': async (req, res, url) => {
      const h = household();
      const rid = requireRoommate(h.id, url.searchParams.get('roommateId'));
      send(res, 200, { messages: db.chat(h.id, rid) });
    },
    'POST /api/chat': async (req, res) => {
      const h = household(), b = await body(req, 2e4);
      const rid = requireRoommate(h.id, b.roommateId);
      const message = String(b.message || '').trim().slice(0, 2000);
      if (!message) throw fail(400, 'bad_message', 'Say something to Chad');
      const history = db.chat(h.id, rid, 20).map(m => ({ role: m.role, content: m.content }));
      const messages = [...history, { role: 'user', content: message }];
      const system = `${CHAD_SYSTEM}\n\n<ledger>\n${JSON.stringify(ledgerForChad(state(), rid))}\n</ledger>`;
      const stream = ai.chat({ system, messages });
      /* pull the first event before committing to a stream, so credential
         failures still come back as a normal JSON error */
      const first = await stream.next();
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      const sse = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      let answer = '', done = null;
      const handle = ev => { if (ev.type === 'text') { answer += ev.text; sse(ev); } else if (ev.type === 'done') done = ev; };
      try {
        if (!first.done) handle(first.value);
        for await (const ev of stream) handle(ev);
        if (done?.stopReason === 'refusal') { const note = "Chad can't help with that one."; answer += answer ? `\n${note}` : note; sse({ type: 'text', text: note }); }
        db.addChat(h.id, rid, 'user', message);
        db.addChat(h.id, rid, 'assistant', answer || '(no answer)');
        sse({ type: 'done', stopReason: done?.stopReason ?? 'end_turn', model: done?.model, usage: done?.usage });
      } catch (err) {
        const e = explainError(err, ai.info.profile);
        log('chat stream failed', e.code, e.detail || e.message);
        sse({ type: 'error', code: e.code, message: e.message });
      }
      res.end();
    },
  };

  const dynamic = [
    [/^\/api\/items\/(\d+)\/photo$/, 'GET', async (req, res, url, [id]) => {
      const h = household(), png = db.photo(h.id, id);
      if (!png) throw fail(404, 'no_photo', 'No photo for this item');
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'private, max-age=86400' }); res.end(png);
    }],
    [/^\/api\/items\/(\d+)\/move-out$/, 'POST', async (req, res, url, [id]) => {
      const h = household(), b = await body(req, 1e4);
      const item = db.item(h.id, id);
      if (!item || item.movedOutAt) throw fail(404, 'not_in_room', 'That item is not in the room');
      const keeper = requireRoommate(h.id, b.keeperId, 'keeper');
      if (!Number.isInteger(b.value) || b.value < 0 || b.value > item.price * 10) throw fail(400, 'bad_value', 'Value must be a non-negative number of cents');
      const transfers = buyout(item, keeper, b.value);
      db.moveOut(h.id, item.id, keeper, b.value, transfers);
      send(res, 200, { item: db.item(h.id, id), transfers });
    }],
  ];

  async function serveStatic(req, res, url) {
    if (!staticDir) return false;
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    let file = path.resolve(staticDir, rel);
    if (!file.startsWith(path.resolve(staticDir))) return false;
    try { if (!(await stat(file)).isFile()) throw new Error('not a file'); }
    catch { if (path.extname(rel)) return false; file = path.join(staticDir, 'index.html'); }
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable' });
      res.end(data); return true;
    } catch { return false; }
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      /* same-origin only: the browser app is served from this server (or the Vite dev proxy) */
      if (req.method !== 'GET' && req.headers.origin) {
        let host = null; try { host = new URL(req.headers.origin).host; } catch {}
        if (host !== req.headers.host) throw fail(403, 'origin', 'Cross-origin requests are not allowed');
      }
      const key = `${req.method} ${url.pathname}`;
      if (routes[key]) return await routes[key](req, res, url);
      for (const [re, method, fn] of dynamic) { const m = url.pathname.match(re); if (m && req.method === method) return await fn(req, res, url, m.slice(1)); }
      if (url.pathname.startsWith('/api/')) throw fail(404, 'not_found', 'No such endpoint');
      if (req.method === 'GET' && await serveStatic(req, res, url)) return;
      throw fail(404, 'not_found', 'Not found');
    } catch (err) {
      const e = explainError(err, ai?.info?.profile);
      if (e.status >= 500) log(req.method, url.pathname, e.code, e.detail || e.message);
      if (!res.headersSent) send(res, e.status, { error: { code: e.code, message: e.message } });
      else res.end();
    }
  };
}
