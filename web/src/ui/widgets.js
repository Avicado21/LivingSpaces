/* Toasts, the category picker and the item details form. */
import { CATEGORIES } from '../../../shared/categories.js';
import { equalSplit, sumValues, money, toCents } from '../../../shared/ledger.js';
import { icon } from '../lib/icons.js';
import { esc, h, avatar, todayISO } from '../lib/dom.js';
import { store } from '../store.js';

export function toast(msg, ms = 2600) {
  let wrap = document.querySelector('.rr-toast-wrap');
  if (!wrap) { wrap = h('<div class="rr-toast-wrap"></div>'); document.body.append(wrap); }
  const t = h(`<div class="rr-toast">${msg}</div>`);
  wrap.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
}

/* result.scores: { category: probability } from Claude Haiku (optional) */
export function categoryPicker(root, result, current, onPick) {
  root.innerHTML = `<div class="rr-cats">${CATEGORIES.map(c => {
    const p = result?.scores?.[c.id];
    return `<button type="button" class="rr-cat" data-cat="${c.id}">${p != null ? `<span class="p">${Math.round(p * 100)}%</span>` : ''}${icon(c.id, 26, 1.6)}${esc(c.label)}</button>`;
  }).join('')}</div>`;
  const set = id => root.querySelectorAll('.rr-cat').forEach(b => b.classList.toggle('on', b.dataset.cat === id));
  root.querySelectorAll('.rr-cat').forEach(b => b.onclick = () => { set(b.dataset.cat); onPick(b.dataset.cat); });
  set(current);
}

/* Name, price, purchase date and who chipped in (evenly or custom amounts).
   read() returns { value: { name, price (cents), purchaseDate, splits: { id: cents } } } or { error }. */
export function detailsForm(root, init = {}) {
  const people = store.roommates;
  const st = { mode: 'even', among: new Set(people.map(r => String(r.id))), custom: {} };
  root.innerHTML = `
    <div class="rr-stack">
      <label class="rr-field"><span>Item name</span><input class="rr-input" data-k="name" maxlength="60" placeholder="e.g. Grey linen sofa" value="${esc(init.name || '')}"></label>
      <div class="rr-grid2">
        <label class="rr-field"><span>Price</span><div class="rr-money"><b>$</b><input class="rr-input" data-k="price" inputmode="decimal" placeholder="0.00" value="${init.price ?? ''}"></div></label>
        <label class="rr-field"><span>Purchase date</span><input class="rr-input" data-k="date" type="date" max="${todayISO()}" value="${init.date || todayISO()}"></label>
      </div>
      <div class="rr-field"><span style="display:flex;justify-content:space-between;align-items:center">Who chipped in
        <span class="rr-seg"><button type="button" data-mode="even" class="on">Evenly</button><button type="button" data-mode="custom">Custom</button></span></span>
        <div class="rr-splits"></div>
        <div class="rr-split-sum"></div>
      </div>
    </div>`;
  const q = k => root.querySelector(`[data-k="${k}"]`);
  const price = () => { const c = toCents(q('price').value); return Number.isNaN(c) ? 0 : c; };
  const amounts = () => {
    const ids = [...st.among];
    if (st.mode === 'even') return ids.length ? equalSplit(price(), ids) : {};
    return Object.fromEntries(ids.map(id => [id, st.custom[id] || 0]));
  };
  const paintSum = () => {
    const p = price(), s = sumValues(amounts()), ok = p > 0 && s === p, el = root.querySelector('.rr-split-sum');
    el.className = 'rr-split-sum ' + (ok ? 'ok' : 'bad');
    el.textContent = !p ? 'Enter a price to see the split' : ok ? `✓ ${money(s)} split ${st.among.size} way${st.among.size === 1 ? '' : 's'}` : `${money(p - s)} still to assign`;
  };
  const paint = () => {
    const a = amounts(), p = price();
    root.querySelector('.rr-splits').innerHTML = people.map(r => {
      const id = String(r.id), on = st.among.has(id), v = a[id] ?? 0;
      return `<div class="rr-split-row ${on ? '' : 'off'}">
        <label class="who"><input type="checkbox" data-in="${id}" ${on ? 'checked' : ''}>${avatar(r, 26)}<span>${esc(r.name)}${id === store.me ? ' (you)' : ''}</span></label>
        <span></span>
        <div class="rr-money"><b>$</b><input class="rr-input" data-amt="${id}" inputmode="decimal" value="${on ? (v / 100).toFixed(2) : ''}" ${st.mode === 'even' || !on ? 'readonly' : ''}></div>
        <span class="pct">${p && on ? Math.round((v / p) * 100) + '%' : '—'}</span></div>`;
    }).join('');
    root.querySelectorAll('[data-in]').forEach(cb => cb.onchange = () => { cb.checked ? st.among.add(cb.dataset.in) : st.among.delete(cb.dataset.in); paint(); });
    root.querySelectorAll('[data-amt]').forEach(inp => inp.oninput = () => {
      const c = toCents(inp.value); st.custom[inp.dataset.amt] = Number.isNaN(c) ? 0 : c;
      inp.closest('.rr-split-row').querySelector('.pct').textContent = p ? Math.round(((st.custom[inp.dataset.amt] || 0) / p) * 100) + '%' : '—';
      paintSum();
    });
    paintSum();
  };
  root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
    if (b.dataset.mode === 'custom' && st.mode === 'even') st.custom = amounts();
    st.mode = b.dataset.mode;
    root.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
    paint();
  });
  q('price').oninput = () => { if (st.mode === 'custom') st.custom = equalSplit(price(), [...st.among]); paint(); };
  paint();
  return {
    read() {
      const name = q('name').value.trim(), p = price();
      const splits = Object.fromEntries(Object.entries(amounts()).filter(([, v]) => v > 0));
      if (!name) return { error: 'Give it a name' };
      if (!p) return { error: 'Add a price' };
      if (sumValues(splits) !== p) return { error: 'Splits need to add up to the price' };
      return { value: { name, price: p, purchaseDate: q('date').value || todayISO(), splits } };
    },
  };
}
