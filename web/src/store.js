/* Client-side copy of the household, refreshed from GET /api/state after every
   change. The server is the source of truth; this just fans updates out. */
import { api } from './lib/api.js';

const ME_KEY = 'livingspaces.me';
const subs = new Set();

export const store = {
  s: null,
  me: localStorage.getItem(ME_KEY),
  on(fn) { subs.add(fn); return () => subs.delete(fn); },
  async refresh() { this.s = await api.state(); subs.forEach(fn => fn(this.s)); return this.s; },
  setMe(id) { this.me = String(id); localStorage.setItem(ME_KEY, this.me); },
  clearMe() { this.me = null; localStorage.removeItem(ME_KEY); },

  get roommates() { return this.s?.roommates || []; },
  get ids() { return this.roommates.map(r => String(r.id)); },
  rm(id) { return this.roommates.find(r => String(r.id) === String(id)); },
  nameOf(id) { return String(id) === this.me ? 'You' : this.rm(id)?.name ?? 'Someone'; },
  /* "you" in sentences, the roommate's name otherwise */
  objOf(id) { return String(id) === this.me ? 'you' : this.rm(id)?.name ?? 'someone'; },
  itemsOf(cat) { return (this.s?.items || []).filter(i => i.category === cat); },
  item(id) { return (this.s?.items || []).find(i => i.id === Number(id)); },
};
