/* Small DOM helpers used across the UI. */
export const $ = sel => document.querySelector(sel);
export const $$ = sel => [...document.querySelectorAll(sel)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const fmtDate = d => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
/* **bold** markup from Chad, safely escaped */
export const richText = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*\*[^*]*$/, m => m.replace('**', ''));
export const avatar = (r, size = 28) => r ? `<span class="rr-av" style="--c:${r.color};--s:${size}px" title="${esc(r.name)}">${esc(r.name[0]?.toUpperCase() || '?')}</span>` : '';
