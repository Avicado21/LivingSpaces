/* Household money math. Every amount is an integer number of cents so splits
   always add up exactly; the UI formats cents for display. Used by the server
   (source of truth, Chad's context) and the browser (live previews). */

/* Split `total` cents evenly; the first ids absorb the leftover cents. */
export function equalSplit(total, ids) {
  const n = ids.length;
  if (!n) return {};
  const base = Math.floor(total / n);
  let rem = total - base * n;
  const out = {};
  for (const id of ids) { out[id] = base + (rem > 0 ? 1 : 0); rem--; }
  return out;
}

export const sumValues = obj => Object.values(obj).reduce((a, b) => a + b, 0);

/* Why a set of per-roommate amounts can't be saved, or null when it's valid. */
export function splitError(price, splits, roommateIds) {
  if (!Number.isInteger(price) || price <= 0) return 'Price must be a positive amount';
  const entries = Object.entries(splits || {});
  if (!entries.length) return 'At least one roommate has to chip in';
  for (const [id, amount] of entries) {
    if (!roommateIds.includes(String(id))) return `Unknown roommate ${id}`;
    if (!Number.isInteger(amount) || amount <= 0) return 'Each share must be a positive amount';
  }
  if (sumValues(splits) !== price) return 'Shares must add up to the price';
  return null;
}

/* Net position per roommate: positive means the house owes them.
   bills: [{ amount, paidBy, among: [ids] }]  (payments are bills paid by the
   payer and shared only by the payee). transfers: [{ from, to, amount }] are
   obligations such as move-out buyouts. */
export function nets(roommateIds, bills, transfers = []) {
  const n = Object.fromEntries(roommateIds.map(id => [String(id), 0]));
  for (const b of bills) {
    const payer = String(b.paidBy);
    if (!(payer in n)) continue;
    n[payer] += b.amount;
    for (const [id, share] of Object.entries(equalSplit(b.amount, b.among.map(String)))) if (id in n) n[id] -= share;
  }
  for (const t of transfers) {
    const from = String(t.from), to = String(t.to);
    if (from in n) n[from] -= t.amount;
    if (to in n) n[to] += t.amount;
  }
  return n;
}

/* Greedy settle-up: largest debtor pays largest creditor until everyone is square. */
export function settleUp(netByRoommate) {
  const cred = [], debt = [];
  for (const [id, v] of Object.entries(netByRoommate)) { if (v > 0) cred.push([id, v]); else if (v < 0) debt.push([id, -v]); }
  cred.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  debt.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const out = [];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const amount = Math.min(debt[i][1], cred[j][1]);
    if (amount > 0) out.push({ from: debt[i][0], to: cred[j][0], amount });
    debt[i][1] -= amount; cred[j][1] -= amount;
    if (!debt[i][1]) i++;
    if (!cred[j][1]) j++;
  }
  return out;
}

/* Move-out buyout: the keeper pays every other co-owner their share of the
   agreed value, in proportion to what each of them paid. */
export function buyout(item, keeperId, value) {
  const keeper = String(keeperId);
  const out = [];
  for (const [id, paid] of Object.entries(item.splits)) {
    if (String(id) === keeper || !(paid > 0)) continue;
    out.push({ from: keeper, to: String(id), amount: Math.round(value * paid / item.price) });
  }
  return out.filter(t => t.amount > 0);
}

/* Straight-line wear: about 20% a year, at least three months of it, never
   below 20% of the price. Rounded to whole dollars. */
export function suggestedValue(price, purchaseDate, today = new Date(), { ratePerYear = 0.2, minYears = 0.25, floor = 0.2 } = {}) {
  const bought = new Date(`${purchaseDate}T12:00:00Z`);
  const years = Math.max(0, (today - bought) / (365.25 * 864e5));
  const factor = Math.max(floor, 1 - ratePerYear * Math.max(years, minYears));
  return { value: Math.round((price * factor) / 100) * 100, years };
}

/* What each roommate has put into the items still in the room. */
export function stakes(roommateIds, items) {
  const s = Object.fromEntries(roommateIds.map(id => [String(id), 0]));
  for (const it of items) for (const [id, v] of Object.entries(it.splits)) if (String(id) in s) s[String(id)] += v;
  return s;
}

/* "$1,234.50" / "-$5" style formatting from cents. */
export function money(cents, { whole = false } = {}) {
  const neg = cents < 0, d = Math.abs(cents) / 100;
  const s = d.toLocaleString('en-US', { minimumFractionDigits: whole && Number.isInteger(d) ? 0 : 2, maximumFractionDigits: 2 });
  return `${neg ? '-' : ''}$${s}`;
}

/* Parse "12", "12.5", "$1,299.99" into cents; NaN when it isn't a money amount. */
export function toCents(input) {
  const s = String(input ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}
