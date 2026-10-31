/* livingSpaces front end: sign in, then one screen. The 3D room in the middle,
   Chad on the left, Bills on the right, Add on the floor, and move-out from any
   item. */
import './styles/base.css';
import './styles/app.css';
import { catLong } from '../../shared/categories.js';
import { money } from '../../shared/ledger.js';
import { icon } from './lib/icons.js';
import { $, $$, esc, avatar } from './lib/dom.js';
import { api } from './lib/api.js';
import { store } from './store.js';
import { createStage } from './scene/stage.js';
import { mountChat } from './ui/chat.js';
import { mountBills } from './ui/bills.js';
import { createAddCard } from './ui/addCard.js';
import { createItemPop } from './ui/itemPop.js';
import { signIn } from './ui/signin.js';

const stage = createStage($('#scene'));

/* ---------- server + AWS session status (top right) ---------- */
function setHealth(h) {
  const el = $('#livePill');
  if (h === null) { el.className = 'livepill bad'; el.textContent = 'Server offline'; el.title = 'Start it with: npm start'; return; }
  if (h.ok) { el.className = 'livepill ok'; el.textContent = `Live · Bedrock ${h.region}`; el.title = `Classify: ${h.models.classify}\nChad: ${h.models.chat}\nAWS profile: ${h.profile}`; return; }
  el.className = 'livepill bad'; el.textContent = h.error?.code === 'aws_auth' ? 'AWS session expired' : 'AI unavailable'; el.title = h.error?.message || '';
}
async function checkHealth() { try { setHealth(await api.health()); } catch { setHealth(null); } }
const onAuthError = e => setHealth({ ok: false, error: { code: 'aws_auth', message: e.message } });

/* ---------- side tabs: drawers slide over the canvas, the room glides aside ---------- */
const drawers = { L: false, R: false };
function setDrawer(side, on = !drawers[side]) {
  drawers[side] = on;
  $('#drawer' + side).classList.toggle('open', on);
  const dw = $('#drawerL').offsetWidth + 16;
  stage.setPanels(drawers.L ? dw : 0, drawers.R ? dw : 0);
}
$$('.tab').forEach(t => {
  t.innerHTML = t.dataset.side === 'L' ? '<b class="chad">C</b><span>Chad</span>' : `${icon('receipt', 18)}<span>Bills</span><b class="badge" id="billBadge"></b>`;
  t.onclick = () => setDrawer(t.dataset.side);
});
addEventListener('resize', () => setDrawer('L', drawers.L));

const chat = mountChat($('#chatRoot'), { onAuthError });
mountBills($('#billsRoot'));
const addCard = createAddCard(stage, { onOpen: () => pop.close(), onAuthError });
const pop = createItemPop(stage, {
  onAskChad: q => { setDrawer('L', true); chat.ask(q); },
  onRoomEmpty: showEnd,
});
$('#addPill').innerHTML = `<i>${icon('plus', 16, 2.4)}</i>Add`;
$('#addPill').onclick = () => addCard.open();

/* ---------- top bar, marker, chips: everything that follows the store ---------- */
store.on(s => {
  const n = s.items.length, total = s.items.reduce((a, i) => a + i.price, 0);
  $('#hhName').textContent = s.household.name;
  $('#roomstat').innerHTML = n
    ? `${icon('rent', 15)}${n} thing${n === 1 ? '' : 's'} in the room <small>· ${money(total, { whole: true })} shared</small>`
    : `${icon('rent', 15)}Empty room <small>· add whenever you buy something together</small>`;
  $('#avs').innerHTML = s.roommates.map(r => avatar(r, 30)).join('');
  const me = store.rm(store.me);
  $('#meChip').innerHTML = me ? `${avatar(me, 24)}${esc(me.name)}` : '';
  const b = $('#billBadge'); b.textContent = s.transfers.length; b.style.display = s.transfers.length ? '' : 'none';
  $('#marker').classList.toggle('compact', n > 0);
  const counts = {};
  for (const i of s.items) counts[i.category] = (counts[i.category] || 0) + 1;
  $('#chips').innerHTML = Object.entries(counts).filter(([, c]) => c > 1).map(([cat, c]) => `<span class="chip" data-chip="${cat}">${icon(cat, 12, 2)}×${c}</span>`).join('');
  stage.sync(counts);
});

stage.onHover((cat, e) => {
  const tip = $('#tip');
  if (!cat || addCard.isOpen || pop.cat === cat) return tip.classList.remove('on');
  const list = store.itemsOf(cat);
  tip.textContent = list.length ? list[0].name + (list.length > 1 ? ` +${list.length - 1} more` : '') : catLong(cat);
  Object.assign(tip.style, { left: e.clientX + 'px', top: e.clientY + 'px' });
  tip.classList.add('on');
});
stage.onFrame(() => {
  const mk = stage.screenOfMarker();
  Object.assign($('#marker').style, { left: mk.x + 'px', top: mk.y + 'px' });
  $('#marker').classList.toggle('busy', addCard.isOpen);
  const s = store.s;
  $('#hint').style.opacity = s && !s.items.length && !s.movedOut.length && !addCard.isOpen ? 1 : 0;
  $('#marker').classList.toggle('away', !!pop.cat);
  for (const c of $$('[data-chip]')) {
    const p = stage.screenOfStack(c.dataset.chip, 0.25); if (!p) continue;
    c.style.left = p.x + 'px'; c.style.top = p.y + 'px'; c.style.opacity = pop.cat === c.dataset.chip ? 0 : 1;
  }
});
addEventListener('keydown', e => { if (e.key === 'Escape' && addCard.isOpen) addCard.close(); });

/* ---------- the end of the flow: everything has left the room ---------- */
function showEnd() {
  const s = store.s; if (!s || s.items.length || !s.movedOut.length) return;
  setDrawer('L', false); setDrawer('R', false);
  const name = id => esc(store.rm(id)?.name);
  const kept = {};
  for (const i of s.movedOut) (kept[i.keptBy] ||= []).push(i.name);
  $('#end').innerHTML = `
    <div style="font-size:40px">🔑</div><h2>Room's empty. Every item has a new home.</h2>
    <p class="rr-muted">${s.transfers.length ? "Here's what's still owed. Settle up in the Bills tab." : "Everyone's square."}</p>
    <div class="kept">${s.transfers.length ? s.transfers.map(x => `<div>${avatar(store.rm(x.from), 26)}${icon('arrow', 14)}${avatar(store.rm(x.to), 26)}<span style="flex:1">${name(x.from)} pays ${name(x.to)}</span><b>${money(x.amount)}</b></div>`).join('') : '<div>Nobody owes anything.</div>'}</div>
    <div class="kept">${Object.entries(kept).map(([rid, names]) => `<div>${avatar(store.rm(rid), 26)}<span style="flex:1">${name(rid)} kept ${names.map(esc).join(', ')}</span></div>`).join('')}</div>
    <div class="btns"><button class="rr-btn" id="endKeep">Back to the room</button></div>`;
  $('#end').classList.add('open');
  $('#endKeep').onclick = () => $('#end').classList.remove('open');
}

/* ---------- boot ---------- */
async function boot() {
  checkHealth(); setInterval(checkHealth, 60000);
  let me = null;
  if (store.me) {
    try { const { roommates } = await api.household(); me = roommates.find(r => String(r.id) === store.me) || null; } catch { me = null; }
  }
  if (!me) me = await signIn();
  else $('#login').classList.add('gone');
  store.setMe(me.id);
  document.body.classList.add('in');
  $('#marker').classList.remove('gone');
  stage.rise();
  await store.refresh();
  await chat.load();
}
$('#meChip').onclick = () => { store.clearMe(); location.reload(); };
boot().catch(e => { console.error(e); $('#loginForm').innerHTML = `<h1>livingSpaces</h1><p class="err">${esc(e.message)}</p>`; $('#login').classList.remove('gone'); });
