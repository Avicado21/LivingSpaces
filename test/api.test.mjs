/* API tests: the real app and SQLite (in memory) with Claude replaced by a fake. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';
import { CATEGORY_IDS } from '../shared/categories.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake image body')]);
const calls = { classify: [], chat: [] };
let failWith = null;

const fakeAI = {
  info: { region: 'us-east-1', profile: 'test-profile', models: { classify: 'fake-haiku', chat: 'fake-sonnet' } },
  async checkCredentials() { if (failWith) throw failWith; return { expiration: null }; },
  async classify({ pngBase64, categories }) {
    if (failWith) throw failWith;
    calls.classify.push({ bytes: Buffer.from(pngBase64, 'base64'), categories });
    return { raw: { category: 'chair', scores: { chair: 0.8, couch: 0.3 }, suggestedName: 'Reading armchair', reason: 'one seat cushion' }, model: 'fake-haiku', ms: 7 };
  },
  async *chat({ system, messages }) {
    if (failWith) throw failWith;
    calls.chat.push({ system, messages });
    yield { type: 'text', text: 'The **sofa** cost ' };
    yield { type: 'text', text: '$899.' };
    yield { type: 'done', stopReason: 'end_turn', model: 'fake-sonnet' };
  },
};

let server, base, db;
before(async () => {
  db = openDb(':memory:');
  server = http.createServer(createApp({ db, ai: fakeAI, now: () => new Date('2026-10-30T12:00:00Z') }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); db.close(); });

const req = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const res = await fetch(base + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, type, body: type.includes('json') ? await res.json() : type.includes('event-stream') ? await res.text() : Buffer.from(await res.arrayBuffer()) };
};
let ids;

test('household setup: none at first, created once, then refuses a second one', async () => {
  assert.equal((await req('/api/household')).body.household, null);
  assert.equal((await req('/api/state')).status, 404);
  assert.equal((await req('/api/household', { method: 'POST', body: { name: 'Apt 4B', roommates: [] } })).status, 400);
  const r = await req('/api/household', { method: 'POST', body: { name: 'Apt 4B', roommates: ['Alex', 'Maya', 'Jordan', 'Alex'] } });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.roommates.map(x => x.name), ['Alex', 'Maya', 'Jordan']);
  ids = Object.fromEntries(r.body.roommates.map(x => [x.name, String(x.id)]));
  assert.equal((await req('/api/household', { method: 'POST', body: { name: 'Again', roommates: ['X'] } })).status, 409);
  const joined = await req('/api/roommates', { method: 'POST', body: { name: 'Sam' } });
  assert.equal(joined.status, 201);
  ids.Sam = String(joined.body.id);
  assert.equal((await req('/api/roommates', { method: 'POST', body: { name: 'sam' } })).status, 409);
});

test('classify sends the PNG and every allowed category to Claude, and normalises the scores', async () => {
  const r = await req('/api/classify', { method: 'POST', body: { image: PNG.toString('base64') } });
  assert.equal(r.status, 200);
  assert.equal(r.body.category, 'chair');
  assert.equal(r.body.suggestedName, 'Reading armchair');
  assert.ok(Math.abs(Object.values(r.body.scores).reduce((a, b) => a + b, 0) - 1) < 0.01);
  assert.deepEqual(calls.classify.at(-1).categories, CATEGORY_IDS);
  assert.ok(calls.classify.at(-1).bytes.equals(PNG));
});

test('classify rejects anything that is not a PNG', async () => {
  const r = await req('/api/classify', { method: 'POST', body: { image: Buffer.from('GIF89a....').toString('base64') } });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'bad_image');
});

test('items: splits must add up; a valid item stores its photo', async () => {
  const bad = await req('/api/items', { method: 'POST', body: { category: 'couch', name: 'Grey linen sofa', price: 89900, purchaseDate: '2026-08-28', splits: { [ids.Alex]: 30000, [ids.Maya]: 30000 } } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'bad_split');
  assert.equal((await req('/api/items', { method: 'POST', body: { category: 'spaceship', name: 'X', price: 100, purchaseDate: '2026-08-28', splits: { [ids.Alex]: 100 } } })).body.error.code, 'bad_category');
  const ok = await req('/api/items', { method: 'POST', body: {
    category: 'couch', name: 'Grey linen sofa', price: 89900, purchaseDate: '2026-08-28', image: PNG.toString('base64'), aiCategory: 'couch', aiConfidence: 0.95,
    splits: { [ids.Alex]: 29967, [ids.Maya]: 29967, [ids.Jordan]: 29966 },
  } });
  assert.equal(ok.status, 201);
  const photo = await req(ok.body.photoUrl);
  assert.equal(photo.status, 200);
  assert.ok(photo.body.equals(PNG));
  const two = await req('/api/items', { method: 'POST', body: { category: 'chair', name: 'Reading armchair', price: 26000, purchaseDate: '2026-09-05', splits: { [ids.Alex]: 13000, [ids.Jordan]: 13000 } } });
  assert.equal(two.status, 201);
  const s = (await req('/api/state')).body;
  assert.equal(s.items.length, 2);
  assert.equal(s.stakes[ids.Alex], 29967 + 13000);
  assert.equal(s.stakes[ids.Sam], 0);
});

test('bills split the balance and payments settle it', async () => {
  const all = [ids.Alex, ids.Maya, ids.Jordan];
  assert.equal((await req('/api/bills', { method: 'POST', body: { name: 'October rent', amount: 285000, paidBy: ids.Alex, among: all, date: '2026-10-01' } })).status, 201);
  assert.equal((await req('/api/bills', { method: 'POST', body: { name: 'Bad', amount: 10, paidBy: '999', among: all } })).status, 400);
  let s = (await req('/api/state')).body;
  assert.deepEqual(s.transfers, [{ from: ids.Maya, to: ids.Alex, amount: 95000 }, { from: ids.Jordan, to: ids.Alex, amount: 95000 }]);
  assert.equal((await req('/api/payments', { method: 'POST', body: { from: ids.Maya, to: ids.Alex, amount: 95000 } })).status, 201);
  s = (await req('/api/state')).body;
  assert.deepEqual(s.transfers, [{ from: ids.Jordan, to: ids.Alex, amount: 95000 }]);
  assert.equal(s.bills.at(-1).kind, 'payment');
});

test('move-out: the keeper owes co-owners their share of the agreed value and the item leaves the room', async () => {
  let s = (await req('/api/state')).body;
  const sofa = s.items.find(i => i.name === 'Grey linen sofa');
  const r = await req(`/api/items/${sofa.id}/move-out`, { method: 'POST', body: { keeperId: ids.Maya, value: 85400 } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.transfers, [{ from: ids.Maya, to: ids.Alex, amount: 28467 }, { from: ids.Maya, to: ids.Jordan, amount: 28466 }]);
  s = (await req('/api/state')).body;
  assert.equal(s.items.some(i => i.id === sofa.id), false);
  assert.equal(s.movedOut[0].keptBy, ids.Maya);
  assert.equal(s.movedOut[0].buyoutValue, 85400);
  assert.equal(s.buyouts.length, 2);
  assert.equal(s.net[ids.Maya], -28467 - 28466);
  assert.equal((await req(`/api/items/${sofa.id}/move-out`, { method: 'POST', body: { keeperId: ids.Maya, value: 85400 } })).status, 404);
});

test('chat streams Chad, grounds him in the ledger and keeps the conversation', async () => {
  const r = await req('/api/chat', { method: 'POST', body: { roommateId: ids.Alex, message: 'Who kept the sofa?' } });
  assert.equal(r.status, 200);
  assert.match(r.type, /event-stream/);
  const events = r.body.split('\n\n').filter(Boolean).map(l => JSON.parse(l.replace(/^data: /, '')));
  assert.equal(events.filter(e => e.type === 'text').map(e => e.text).join(''), 'The **sofa** cost $899.');
  assert.equal(events.at(-1).type, 'done');
  const { system, messages } = calls.chat.at(-1);
  assert.match(system, /You are Chad/);
  assert.match(system, /"you":"Alex"/);
  assert.match(system, /Grey linen sofa/);
  assert.match(system, /"keptBy":"Maya"/);
  assert.deepEqual(messages.at(-1), { role: 'user', content: 'Who kept the sofa?' });
  const hist = (await req(`/api/chat?roommateId=${ids.Alex}`)).body.messages;
  assert.deepEqual(hist.map(m => m.role), ['user', 'assistant']);
  await req('/api/chat', { method: 'POST', body: { roommateId: ids.Alex, message: 'And the chair?' } });
  assert.equal(calls.chat.at(-1).messages.length, 3);
  assert.equal((await req(`/api/chat?roommateId=${ids.Maya}`)).body.messages.length, 0);
});

test('an expired AWS session comes back as one clear message', async () => {
  failWith = Object.assign(new Error('Token is expired'), { name: 'CredentialsProviderError' });
  try {
    const c = await req('/api/classify', { method: 'POST', body: { image: PNG.toString('base64') } });
    assert.equal(c.status, 401);
    assert.equal(c.body.error.code, 'aws_auth');
    assert.match(c.body.error.message, /aws sso login --profile test-profile/);
    const chat = await req('/api/chat', { method: 'POST', body: { roommateId: ids.Alex, message: 'hi' } });
    assert.equal(chat.status, 401);
    assert.equal(chat.body.error.code, 'aws_auth');
    const health = await req('/api/health');
    assert.equal(health.body.ok, false);
    assert.equal(health.body.error.code, 'aws_auth');
  } finally { failWith = null; }
});

test('cross-origin writes are refused', async () => {
  const r = await req('/api/bills', { method: 'POST', headers: { origin: 'https://evil.example' }, body: { name: 'x', amount: 1, paidBy: ids.Alex, among: [ids.Alex] } });
  assert.equal(r.status, 403);
});

test('state survives reopening the database file', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = mkdtempSync(path.join(tmpdir(), 'livingspaces-'));
  try {
    const file = path.join(dir, 'test.db');
    const a = openDb(file);
    const hid = a.createHousehold('Persisted', ['Pat', 'Kim']);
    const [pat, kim] = a.roommates(hid);
    a.createItem(hid, { category: 'tv', name: 'TV', price: 50000, purchaseDate: '2026-09-01', splits: { [pat.id]: 25000, [kim.id]: 25000 }, photo: PNG });
    a.close();
    const b = openDb(file);
    assert.equal(b.household().name, 'Persisted');
    assert.equal(b.items(hid)[0].name, 'TV');
    assert.ok(b.photo(hid, b.items(hid)[0].id).equals(PNG));
    b.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
