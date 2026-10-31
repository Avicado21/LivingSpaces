/* Same-origin calls to the livingSpaces server. Every failure becomes an Error
   with a `code`, a short `title` and a message the UI can show as-is. */
const TITLES = { aws_auth: 'AWS session expired', offline: 'Server offline', rate_limited: 'Bedrock is busy', refusal: 'Claude declined' };

async function call(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw Object.assign(new Error("Can't reach the livingSpaces server. Is it running (npm start)?"), { code: 'offline', title: TITLES.offline });
  }
  if (res.ok) return res;
  const e = (await res.json().catch(() => ({}))).error || {};
  throw Object.assign(new Error(e.message || `Server error ${res.status}`), { code: e.code || 'http_' + res.status, status: res.status, title: TITLES[e.code] || 'Something went wrong' });
}
const json = async (path, opts) => (await call(path, opts)).json();

export const api = {
  health: () => json('/api/health'),
  household: () => json('/api/household'),
  createHousehold: (name, roommates) => json('/api/household', { method: 'POST', body: { name, roommates } }),
  addRoommate: name => json('/api/roommates', { method: 'POST', body: { name } }),
  state: () => json('/api/state'),
  classify: (image, categories) => json('/api/classify', { method: 'POST', body: { image, categories } }),
  createItem: item => json('/api/items', { method: 'POST', body: item }),
  moveOut: (id, keeperId, value) => json(`/api/items/${id}/move-out`, { method: 'POST', body: { keeperId, value } }),
  createBill: bill => json('/api/bills', { method: 'POST', body: bill }),
  pay: (from, to, amount) => json('/api/payments', { method: 'POST', body: { from, to, amount } }),
  chatHistory: roommateId => json(`/api/chat?roommateId=${encodeURIComponent(roommateId)}`),

  /* streams Chad's answer; onDelta gets each text piece */
  async chat(roommateId, message, onDelta) {
    const res = await call('/api/chat', { method: 'POST', body: { roommateId, message } });
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, i).replace(/^data: /, ''); buf = buf.slice(i + 2);
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.type === 'text') onDelta(ev.text);
        if (ev.type === 'error') throw Object.assign(new Error(ev.message), { code: ev.code, title: TITLES[ev.code] || "Chad couldn't answer" });
      }
    }
  },
};
