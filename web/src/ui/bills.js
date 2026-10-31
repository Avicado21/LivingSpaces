/* Right tab: who owes whom, recent bills, move-out buyouts and everyone's
   stake in the shared furniture. All numbers come from the server. */
import { money, toCents } from '../../../shared/ledger.js';
import { icon } from '../lib/icons.js';
import { esc, avatar, fmtDate } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { store } from '../store.js';
import { toast } from './widgets.js';

const KIND_ICON = { rent: 'rent', utility: 'utility', wifi: 'wifi', groceries: 'groceries', payment: 'payment', buyout: 'key' };
const billIcon = kind => icon(KIND_ICON[kind] || 'receipt', 18);
const guessKind = name => /rent/i.test(name) ? 'rent' : /(electric|power|gas|water|pg&e|utility)/i.test(name) ? 'utility' : /(wifi|internet|fiber|comcast)/i.test(name) ? 'wifi' : /(grocer|costco|trader|food)/i.test(name) ? 'groceries' : 'bill';

export function mountBills(root) {
  let adding = false, busy = false;
  root.innerHTML = `<div class="rr-panel">
    <div class="rr-panel-head"><div><h3>Bills & splits</h3><p id="billsSub"></p></div>
      <button class="rr-btn sm" data-act="add">${icon('plus', 16)}Bill</button></div>
    <div class="rr-panel-body"></div></div>`;
  const body = root.querySelector('.rr-panel-body');
  root.querySelector('[data-act="add"]').onclick = () => { adding = !adding; paint(); };

  function paint() {
    const s = store.s; if (!s) return;
    root.querySelector('#billsSub').innerHTML = `${esc(s.household.name)} · ${s.roommates.map(r => avatar(r, 18)).join('')}`;
    const mine = s.net[store.me] ?? 0;
    const stakeTotal = Object.values(s.stakes).reduce((a, b) => a + b, 0) || 1;
    body.innerHTML = `
      ${adding ? `<form class="rr-addbill">
        <label class="rr-field"><span>What for?</span><input class="rr-input" name="n" maxlength="60" placeholder="e.g. Water bill" required></label>
        <div class="rr-grid2">
          <label class="rr-field"><span>Amount</span><div class="rr-money"><b>$</b><input class="rr-input" name="a" inputmode="decimal" required></div></label>
          <label class="rr-field"><span>Paid by</span><select class="rr-input" name="p">${s.roommates.map(r => `<option value="${r.id}" ${String(r.id) === store.me ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
        </div>
        <div class="rr-field"><span>Split evenly between</span><div class="rr-who-pick">${s.roommates.map(r => `<label><input type="checkbox" name="w" value="${r.id}" checked>${avatar(r, 22)}${esc(r.name)}</label>`).join('')}</div></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="rr-btn ghost sm" data-act="cancel">Cancel</button><button class="rr-btn sm">Add bill</button></div>
      </form>` : ''}
      <div class="rr-bal">
        <div class="rr-muted rr-small" style="font-weight:700;text-transform:uppercase;letter-spacing:.07em">Your balance</div>
        <div class="big ${mine >= 0 ? 'pos' : 'neg'}">${mine > 0 ? "You're owed " + money(mine) : mine < 0 ? 'You owe ' + money(-mine) : "You're square"}</div>
        ${s.transfers.length ? s.transfers.map((x, i) => `<div class="rr-xfer">${avatar(store.rm(x.from), 24)}<span class="who">${esc(store.nameOf(x.from))} → ${esc(store.nameOf(x.to))}</span><span class="amt">${money(x.amount)}</span><button class="rr-btn soft" data-pay="${i}">Mark paid</button></div>`).join('') : '<div class="rr-pill good">Everyone is square 🎉</div>'}
      </div>
      ${s.buyouts.length ? `<div class="rr-sec">Move-out buyouts</div><ul class="rr-bills">${s.buyouts.map(b => `<li class="rr-bill"><span class="ic">${billIcon('buyout')}</span><div style="min-width:0"><div class="t">${esc(b.itemName)}</div><div class="s">${esc(store.rm(b.from)?.name)} keeps it · owes ${esc(store.rm(b.to)?.name)}</div></div><div class="a">${money(b.amount)}</div></li>`).join('')}</ul>` : ''}
      <div class="rr-sec">Recent bills</div>
      ${s.bills.length ? `<ul class="rr-bills">${s.bills.slice().reverse().map(b => `<li class="rr-bill"><span class="ic">${billIcon(b.kind)}</span><div style="min-width:0"><div class="t">${esc(b.name)}</div><div class="s">${b.kind === 'payment' ? 'settled up' : `${esc(store.rm(b.paidBy)?.name)} paid · ${b.among.length === s.roommates.length ? `split ${b.among.length} ways` : 'split ' + b.among.map(id => esc(store.rm(id)?.name)).join(' & ')}`} · ${fmtDate(b.date)}</div></div><div class="a">${money(b.amount)}<small>${b.kind === 'payment' ? 'payment' : money(Math.round(b.amount / b.among.length)) + ' each'}</small></div></li>`).join('')}</ul>` : '<div class="rr-empty-note">No bills yet. Add rent, utilities or a grocery run with + Bill.</div>'}
      <div class="rr-sec">Shared furniture</div>
      ${s.items.length ? `<div class="rr-stake">${s.roommates.map(r => `<div class="rr-stake-row"><span>${esc(r.name)}</span><span class="bar"><i style="width:${(s.stakes[r.id] / stakeTotal) * 100}%;background:${r.color}"></i></span><span class="v">${money(s.stakes[r.id] || 0, { whole: true })}</span></div>`).join('')}<div class="rr-muted rr-small">${s.items.length} item${s.items.length === 1 ? '' : 's'} in the room · ${money(Object.values(s.stakes).reduce((a, b) => a + b, 0), { whole: true })} total</div></div>` : '<div class="rr-empty-note">Nothing shared in the room right now.</div>'}`;

    body.querySelectorAll('[data-pay]').forEach(b => b.onclick = async () => {
      if (busy) return; busy = true;
      const x = s.transfers[+b.dataset.pay];
      try { await api.pay(x.from, x.to, x.amount); await store.refresh(); toast(`${icon('check', 16)} Recorded ${money(x.amount)} from ${esc(store.rm(x.from)?.name)} to ${esc(store.rm(x.to)?.name)}`); }
      catch (e) { toast(esc(e.message), 4000); }
      busy = false;
    });
    const f = body.querySelector('form');
    if (f) {
      f.querySelector('[data-act="cancel"]').onclick = () => { adding = false; paint(); };
      f.onsubmit = async e => {
        e.preventDefault();
        const fd = new FormData(f), among = fd.getAll('w'), amount = toCents(fd.get('a')), name = String(fd.get('n') || '').trim();
        if (!name) return toast('What was the bill for?');
        if (!(amount > 0)) return toast('Enter an amount like 96.40');
        if (!among.length) return toast('Pick at least one person to split with');
        try {
          await api.createBill({ name, amount, paidBy: fd.get('p'), among, kind: guessKind(name) });
          adding = false; await store.refresh();
          toast(`${icon('check', 16)} ${esc(name)} added and split ${among.length} way${among.length === 1 ? '' : 's'}`);
        } catch (err) { toast(esc(err.message), 4000); }
      };
      f.querySelector('input').focus();
    }
  }
  store.on(paint);
  paint();
}
