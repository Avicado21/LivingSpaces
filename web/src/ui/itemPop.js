/* The item card pinned above a model: every item of that type behind ‹ ›
   arrows, who paid what, Ask Chad, and per-item move-out with a buyout value. */
import { catLong } from '../../../shared/categories.js';
import { buyout, suggestedValue, money } from '../../../shared/ledger.js';
import { icon } from '../lib/icons.js';
import { $, esc, avatar, fmtDate } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { store } from '../store.js';
import { toast } from './widgets.js';

export function createItemPop(stage, { onAskChad, onRoomEmpty } = {}) {
  let cat = null, idx = 0, page = 1, keeper = null, value = 0, busy = false;
  const pop = $('#pop'), card = $('#popCard');

  const items = () => store.itemsOf(cat);
  const fit = () => { card.style.height = $(page === 1 ? '#pg1' : '#pg2').offsetHeight + 'px'; };

  function open(c, i = 0) {
    if (!store.itemsOf(c).length) return;
    cat = c; idx = Math.min(i, items().length - 1);
    stage.select(c); paint(0);
    pop.classList.add('open'); fit();
  }
  function close() {
    pop.classList.remove('open'); stage.setGolden(false); stage.select(null);
    cat = null; page = 1;
  }
  function flip(d) {
    const n = items().length; if (n < 2) return;
    idx = (idx + d + n) % n; paint(d);
  }

  function paint(dir) {
    const list = items(), item = list[idx];
    if (!item) return close();
    keeper = null; page = 1; stage.setGolden(false);
    const sug = suggestedValue(item.price, item.purchaseDate); value = sug.value;
    card.classList.remove('p2');
    const n = list.length;
    $('#pg1').innerHTML = `<div class="pg1in ${dir > 0 ? 'from-r' : dir < 0 ? 'from-l' : ''}">
      ${n > 1 ? `<div class="pager"><span>${esc(catLong(item.category))} · ${idx + 1} of ${n}</span><span class="nav"><span class="dots">${list.map((_, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('')}</span><button data-act="prev" aria-label="Previous ${esc(catLong(item.category))}">‹</button><button data-act="next" aria-label="Next ${esc(catLong(item.category))}">›</button></span></div>` : ''}
      <div class="pop-top">${item.photoUrl ? `<img src="${item.photoUrl}" alt="">` : `<span class="noimg">${icon(item.category, 30, 1.5)}</span>`}<div style="min-width:0"><span class="rr-pill">${icon(item.category, 12)}${esc(catLong(item.category))}</span><h4>${esc(item.name)}</h4><p>${money(item.price)} · bought ${fmtDate(item.purchaseDate)}</p></div><button class="x" data-act="close" aria-label="Close">${icon('close', 13)}</button></div>
      <div class="owners">${Object.entries(item.splits).map(([rid, v]) => `<div class="owner">${avatar(store.rm(rid), 24)}<span>${esc(store.nameOf(rid))} paid</span><span>${money(v)}</span><span class="bar"><i style="width:${(v / item.price) * 100}%;background:${store.rm(rid)?.color}"></i></span></div>`).join('')}</div>
      <div class="acts"><button class="rr-btn ghost" data-act="chad">Ask Chad</button><button class="rr-btn dark" data-act="mo">${icon('box', 16)}Move out</button></div></div>`;
    $('#pg2').innerHTML = `
      <button class="backlink" data-act="back">← ${esc(item.name)}</button>
      <h4>Who's keeping it?</h4>
      <div class="keepers">${store.roommates.map(r => `<button class="keeper" data-k="${r.id}">${avatar(r, 34)}${esc(r.name)}<small>${item.splits[r.id] ? 'paid ' + money(item.splits[r.id], { whole: true }) : "didn't chip in"}</small></button>`).join('')}</div>
      <div class="value"><div class="row"><span class="rr-muted rr-small" style="font-weight:750;text-transform:uppercase;letter-spacing:.07em">Value now</span><span class="amt" id="valAmt"></span></div>
        <input type="range" id="valRange" min="0" max="${item.price}" step="100" value="${value}" aria-label="Value at move-out">
        <div class="presets"><button class="rr-btn soft" data-v="${sug.value}">Suggested ${money(sug.value, { whole: true })}</button><button class="rr-btn ghost" data-v="${item.price}">Paid ${money(item.price, { whole: true })}</button><button class="rr-btn ghost" data-v="${Math.round(item.price / 200) * 100}">Half</button></div>
        <span class="note">Suggested: about 20% a year of wear (min. 3 months)</span></div>
      <div class="xfers" id="xfers"><div class="note">Pick who's keeping it to see who owes whom.</div></div>
      <button class="rr-btn block" data-act="confirm" disabled>Confirm move-out</button>`;
    const paintX = () => {
      $('#valAmt').textContent = money(value, { whole: true });
      pop.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', +b.dataset.v === value));
      if (!keeper) return;
      const t = buyout(item, keeper, value);
      $('#xfers').innerHTML = t.length
        ? t.map(x => `<div class="rr-xfer">${avatar(store.rm(x.to), 24)}<span class="who">${esc(store.nameOf(x.from))} ${x.from === store.me ? 'pay' : 'pays'} ${esc(store.objOf(x.to))}</span><span class="amt">${money(x.amount)}</span></div>`).join('')
        : `<div class="note">${esc(store.nameOf(keeper))} paid for all of it, so nobody owes anything.</div>`;
      fit();
    };
    pop.onclick = async e => {
      const a = e.target.closest('[data-act]')?.dataset.act, k = e.target.closest('[data-k]')?.dataset.k, v = e.target.closest('[data-v]')?.dataset.v;
      if (a === 'close') close();
      if (a === 'prev') flip(-1);
      if (a === 'next') flip(1);
      if (a === 'chad') onAskChad?.(`Tell me about the ${item.name}`);
      if (a === 'mo') { page = 2; card.classList.add('p2'); stage.setGolden(true); paintX(); fit(); }
      if (a === 'back') { page = 1; card.classList.remove('p2'); stage.setGolden(false); fit(); }
      if (v) { value = +v; $('#valRange').value = value; paintX(); }
      if (k) {
        keeper = k;
        pop.querySelectorAll('.keeper').forEach(b => b.classList.toggle('on', b.dataset.k === k));
        pop.querySelector('[data-act="confirm"]').disabled = false;
        paintX();
      }
      if (a === 'confirm' && keeper && !busy) await moveOut(item);
    };
    $('#valRange').oninput = e => { value = +e.target.value; paintX(); };
    fit();
  }

  async function moveOut(item) {
    busy = true;
    try {
      const { transfers } = await api.moveOut(item.id, keeper, value);
      const k = store.rm(keeper)?.name, left = items().length - 1;
      const msg = `${icon('key', 16)} ${esc(k)} keeps the ${esc(item.name)}${transfers.length ? ' · ' + transfers.map(x => `${money(x.amount)} to ${esc(store.rm(x.to)?.name)}`).join(', ') : ''}`;
      if (left > 0) {
        await store.refresh();
        toast(`${msg} · ${left} ${esc(catLong(item.category).toLowerCase())} left`, 3600);
        idx = Math.min(idx, left - 1); paint(1);
      } else {
        close();
        await store.refresh();
        toast(msg, 3600);
        if (!store.s.items.length) setTimeout(() => onRoomEmpty?.(), 700);
      }
    } catch (e) { toast(esc(e.message), 4000); }
    busy = false;
  }

  stage.onPick(c => { if (c) open(c); else if (cat) close(); });
  addEventListener('keydown', e => {
    if (!cat) return;
    if (e.key === 'Escape') close();
    if (page === 1 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) flip(e.key === 'ArrowRight' ? 1 : -1);
  });
  /* keep the card pinned above the model; re-render when another roommate's data changes it */
  store.on(() => { if (cat && !store.itemsOf(cat).length) close(); });
  stage.onFrame(() => {
    if (!cat) return;
    const s = stage.screenOfStack(cat); if (!s) return;
    const hgt = pop.offsetHeight || 300, below = s.y - hgt - 30 < 70;
    pop.classList.toggle('below', below);
    const y = below ? Math.min(innerHeight - hgt - 20, (stage.screenOfStackBase(cat)?.y ?? s.y) + 10) : s.y;
    pop.style.left = Math.min(innerWidth - 180, Math.max(180, s.x)) + 'px'; pop.style.top = y + 'px';
  });

  return { open, close, get cat() { return cat; } };
}
