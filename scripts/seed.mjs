/* npm run seed: a demo household (Apt 4B: Alex, Maya, Jordan) with a month of
   bills, so the Bills tab and Chad have something to work with. Furniture is
   added through the app with real photos. Does nothing if a household exists. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/db.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.env.LIVINGSPACES_DB || path.join(root, 'data', 'livingspaces.db');
const db = openDb(file);

if (db.household()) {
  console.log(`A household already exists in ${path.relative(root, file)} (${db.household().name}); nothing to seed.`);
} else {
  const hid = db.createHousehold('Apt 4B', ['Alex', 'Maya', 'Jordan']);
  const [alex, maya, jordan] = db.roommates(hid).map(r => r.id);
  const all = [alex, maya, jordan];
  const bills = [
    { name: 'October rent', amount: 285000, paidBy: alex, among: all, date: '2026-10-01', kind: 'rent' },
    { name: 'PG&E electric', amount: 9640, paidBy: maya, among: all, date: '2026-10-12', kind: 'utility' },
    { name: 'Fiber internet', amount: 7000, paidBy: jordan, among: all, date: '2026-10-15', kind: 'wifi' },
    { name: 'Costco run', amount: 12855, paidBy: alex, among: [alex, maya], date: '2026-10-20', kind: 'groceries' },
  ];
  for (const b of bills) db.createBill(hid, b);
  console.log(`Seeded "Apt 4B" with Alex, Maya and Jordan and ${bills.length} bills in ${path.relative(root, file)}.`);
}
db.close();
