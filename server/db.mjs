/* SQLite persistence (node:sqlite, no native dependency). One file holds the
   household, roommates, items with their PNG photo, per-roommate splits,
   bills, move-out buyouts and Chad's conversation. Money is integer cents. */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS households (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS roommates (
  id INTEGER PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (household_id, name)
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  purchase_date TEXT NOT NULL,
  photo BLOB,
  ai_category TEXT,
  ai_confidence REAL,
  created_by INTEGER REFERENCES roommates(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  moved_out_at TEXT,
  kept_by INTEGER REFERENCES roommates(id),
  buyout_value_cents INTEGER
);
CREATE TABLE IF NOT EXISTS item_splits (
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  roommate_id INTEGER NOT NULL REFERENCES roommates(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  PRIMARY KEY (item_id, roommate_id)
);
CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  paid_by INTEGER NOT NULL REFERENCES roommates(id),
  kind TEXT NOT NULL DEFAULT 'bill',
  bill_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS bill_shares (
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  roommate_id INTEGER NOT NULL REFERENCES roommates(id),
  PRIMARY KEY (bill_id, roommate_id)
);
CREATE TABLE IF NOT EXISTS buyouts (
  id INTEGER PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  from_id INTEGER NOT NULL REFERENCES roommates(id),
  to_id INTEGER NOT NULL REFERENCES roommates(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id),
  roommate_id INTEGER NOT NULL REFERENCES roommates(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const COLORS = ['#e0895f', '#6fa38c', '#8f8fcf', '#d4a24c', '#c86f8f', '#5f9fbf', '#9a7b5f', '#7fa35a'];

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  const q = sql => db.prepare(sql);
  const tx = fn => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };

  const roommateRow = r => ({ id: r.id, name: r.name, color: r.color });
  const api = {
    raw: db,
    close: () => db.close(),

    household() {
      const h = q('SELECT id, name FROM households ORDER BY id LIMIT 1').get();
      return h ? { id: h.id, name: h.name } : null;
    },
    createHousehold(name, roommateNames) {
      return tx(() => {
        const { lastInsertRowid: hid } = q('INSERT INTO households (name) VALUES (?)').run(name);
        roommateNames.forEach((n, i) => q('INSERT INTO roommates (household_id, name, color) VALUES (?, ?, ?)').run(hid, n, COLORS[i % COLORS.length]));
        return Number(hid);
      });
    },
    roommates(hid) {
      return q('SELECT id, name, color FROM roommates WHERE household_id = ? ORDER BY id').all(hid).map(roommateRow);
    },
    addRoommate(hid, name) {
      const n = q('SELECT COUNT(*) AS n FROM roommates WHERE household_id = ?').get(hid).n;
      const { lastInsertRowid } = q('INSERT INTO roommates (household_id, name, color) VALUES (?, ?, ?)').run(hid, name, COLORS[n % COLORS.length]);
      return roommateRow(q('SELECT id, name, color FROM roommates WHERE id = ?').get(lastInsertRowid));
    },

    createItem(hid, { category, name, price, purchaseDate, splits, photo, aiCategory, aiConfidence, createdBy }) {
      return tx(() => {
        const { lastInsertRowid: id } = q(`INSERT INTO items (household_id, category, name, price_cents, purchase_date, photo, ai_category, ai_confidence, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(hid, category, name, price, purchaseDate, photo ?? null, aiCategory ?? null, aiConfidence ?? null, createdBy ?? null);
        for (const [rid, amount] of Object.entries(splits)) q('INSERT INTO item_splits (item_id, roommate_id, amount_cents) VALUES (?, ?, ?)').run(id, Number(rid), amount);
        return Number(id);
      });
    },
    items(hid) {
      const rows = q(`SELECT id, category, name, price_cents, purchase_date, photo IS NOT NULL AS has_photo, ai_category, ai_confidence,
        created_at, moved_out_at, kept_by, buyout_value_cents FROM items WHERE household_id = ? ORDER BY id`).all(hid);
      const splits = q('SELECT s.item_id, s.roommate_id, s.amount_cents FROM item_splits s JOIN items i ON i.id = s.item_id WHERE i.household_id = ?').all(hid);
      const byItem = {};
      for (const s of splits) (byItem[s.item_id] ||= {})[String(s.roommate_id)] = s.amount_cents;
      return rows.map(r => ({
        id: r.id, category: r.category, name: r.name, price: r.price_cents, purchaseDate: r.purchase_date,
        hasPhoto: !!r.has_photo, aiCategory: r.ai_category, aiConfidence: r.ai_confidence, createdAt: r.created_at,
        splits: byItem[r.id] || {},
        movedOutAt: r.moved_out_at, keptBy: r.kept_by == null ? null : String(r.kept_by), buyoutValue: r.buyout_value_cents,
      }));
    },
    item(hid, id) { return api.items(hid).find(i => i.id === Number(id)) || null; },
    photo(hid, id) {
      const r = q('SELECT photo FROM items WHERE household_id = ? AND id = ?').get(hid, Number(id));
      return r?.photo ? Buffer.from(r.photo) : null;
    },
    moveOut(hid, itemId, keeperId, value, transfers) {
      return tx(() => {
        const r = q("UPDATE items SET moved_out_at = datetime('now'), kept_by = ?, buyout_value_cents = ? WHERE household_id = ? AND id = ? AND moved_out_at IS NULL").run(Number(keeperId), value, hid, Number(itemId));
        if (!r.changes) throw Object.assign(new Error('Item is not in the room'), { http: 409 });
        for (const t of transfers) q('INSERT INTO buyouts (household_id, item_id, from_id, to_id, amount_cents) VALUES (?, ?, ?, ?, ?)').run(hid, Number(itemId), Number(t.from), Number(t.to), t.amount);
      });
    },

    createBill(hid, { name, amount, paidBy, among, date, kind = 'bill' }) {
      return tx(() => {
        const { lastInsertRowid: id } = q('INSERT INTO bills (household_id, name, amount_cents, paid_by, kind, bill_date) VALUES (?, ?, ?, ?, ?, ?)').run(hid, name, amount, Number(paidBy), kind, date);
        for (const rid of among) q('INSERT INTO bill_shares (bill_id, roommate_id) VALUES (?, ?)').run(id, Number(rid));
        return Number(id);
      });
    },
    bills(hid) {
      const rows = q('SELECT id, name, amount_cents, paid_by, kind, bill_date FROM bills WHERE household_id = ? ORDER BY bill_date, id').all(hid);
      const shares = q('SELECT s.bill_id, s.roommate_id FROM bill_shares s JOIN bills b ON b.id = s.bill_id WHERE b.household_id = ? ORDER BY s.roommate_id').all(hid);
      const byBill = {};
      for (const s of shares) (byBill[s.bill_id] ||= []).push(String(s.roommate_id));
      return rows.map(r => ({ id: r.id, name: r.name, amount: r.amount_cents, paidBy: String(r.paid_by), kind: r.kind, date: r.bill_date, among: byBill[r.id] || [] }));
    },
    buyouts(hid) {
      return q(`SELECT b.id, b.item_id, i.name AS item_name, b.from_id, b.to_id, b.amount_cents, b.created_at
        FROM buyouts b JOIN items i ON i.id = b.item_id WHERE b.household_id = ? ORDER BY b.id`).all(hid)
        .map(r => ({ id: r.id, itemId: r.item_id, itemName: r.item_name, from: String(r.from_id), to: String(r.to_id), amount: r.amount_cents, createdAt: r.created_at }));
    },

    addChat(hid, rid, role, content) { q('INSERT INTO chat_messages (household_id, roommate_id, role, content) VALUES (?, ?, ?, ?)').run(hid, Number(rid), role, content); },
    chat(hid, rid, limit = 30) {
      return q('SELECT role, content, created_at FROM (SELECT * FROM chat_messages WHERE household_id = ? AND roommate_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id').all(hid, Number(rid), limit)
        .map(r => ({ role: r.role, content: r.content, createdAt: r.created_at }));
    },
  };
  return api;
}
