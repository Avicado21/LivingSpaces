import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equalSplit, sumValues, splitError, nets, settleUp, buyout, suggestedValue, stakes, money, toCents } from '../shared/ledger.js';

test('equalSplit hands the leftover cents to the first roommates and always adds up', () => {
  assert.deepEqual(equalSplit(100, ['a', 'b', 'c']), { a: 34, b: 33, c: 33 });
  assert.deepEqual(equalSplit(89900, ['1', '2', '3']), { 1: 29967, 2: 29967, 3: 29966 });
  for (const total of [1, 2, 7, 99999, 54999]) for (const n of [1, 2, 3, 4, 7]) {
    const ids = Array.from({ length: n }, (_, i) => String(i));
    assert.equal(sumValues(equalSplit(total, ids)), total);
  }
  assert.deepEqual(equalSplit(500, []), {});
});

test('splitError accepts exact splits and explains bad ones', () => {
  const ids = ['1', '2', '3'];
  assert.equal(splitError(1000, { 1: 500, 2: 500 }, ids), null);
  assert.match(splitError(1000, { 1: 500, 2: 400 }, ids), /add up/);
  assert.match(splitError(1000, { 9: 1000 }, ids), /Unknown roommate/);
  assert.match(splitError(1000, { 1: 1000.5 }, ids), /positive amount/);
  assert.match(splitError(0, { 1: 0 }, ids), /Price/);
  assert.match(splitError(1000, {}, ids), /chip in/);
});

test('nets and settleUp: rent paid by one roommate, a two-way grocery run, a payment', () => {
  const ids = ['alex', 'maya', 'jordan'];
  const bills = [
    { amount: 285000, paidBy: 'alex', among: ids },
    { amount: 9640, paidBy: 'maya', among: ids },
    { amount: 7000, paidBy: 'jordan', among: ids },
    { amount: 12855, paidBy: 'alex', among: ['alex', 'maya'] },
  ];
  const n = nets(ids, bills);
  assert.equal(sumValues(n), 0);
  assert.deepEqual(settleUp(n), [{ from: 'maya', to: 'alex', amount: 97333 }, { from: 'jordan', to: 'alex', amount: 93546 }]);
  /* recording Maya's payment as a bill paid by Maya and shared by Alex settles her */
  const after = nets(ids, [...bills, { amount: 97333, paidBy: 'maya', among: ['alex'] }]);
  assert.equal(after.maya, 0);
  assert.deepEqual(settleUp(after), [{ from: 'jordan', to: 'alex', amount: 93546 }]);
});

test('move-out buyouts count as obligations in the balance', () => {
  const ids = ['1', '2', '3'];
  const n = nets(ids, [], [{ from: '2', to: '1', amount: 28467 }, { from: '2', to: '3', amount: 28466 }]);
  assert.deepEqual(n, { 1: 28467, 2: -56933, 3: 28466 });
  assert.equal(settleUp({ 1: 0, 2: 0, 3: 0 }).length, 0);
});

test('buyout: the keeper repays each co-owner their share of the agreed value', () => {
  const sofa = { price: 89900, splits: { 1: 29967, 2: 29967, 3: 29966 } };
  assert.deepEqual(buyout(sofa, '2', 85400), [{ from: '2', to: '1', amount: 28467 }, { from: '2', to: '3', amount: 28466 }]);
  assert.deepEqual(buyout(sofa, '2', 89900), [{ from: '2', to: '1', amount: 29967 }, { from: '2', to: '3', amount: 29966 }]);
  /* someone who didn't chip in pays every owner */
  const ps5 = { price: 49900, splits: { 1: 24950, 3: 24950 } };
  assert.deepEqual(buyout(ps5, '2', 49900), [{ from: '2', to: '1', amount: 24950 }, { from: '2', to: '3', amount: 24950 }]);
  /* the sole owner keeping it owes nothing, and a zero value creates no transfers */
  assert.deepEqual(buyout({ price: 26000, splits: { 1: 26000 } }, '1', 26000), []);
  assert.deepEqual(buyout(sofa, '1', 0), []);
});

test('suggestedValue: 20% a year, at least three months of wear, floor at 20% of the price', () => {
  const today = new Date('2026-10-30T12:00:00Z');
  assert.equal(suggestedValue(89900, '2026-08-28', today).value, 85400);
  assert.equal(suggestedValue(49900, '2026-09-20', today).value, 47400);
  assert.equal(suggestedValue(100000, '2024-10-30', today).value, 60000);
  assert.equal(suggestedValue(100000, '2010-01-01', today).value, 20000);
});

test('stakes add up each roommate\'s share of the items in the room', () => {
  assert.deepEqual(stakes(['1', '2'], [{ splits: { 1: 500, 2: 500 } }, { splits: { 1: 250 } }]), { 1: 750, 2: 500 });
});

test('money formatting and parsing', () => {
  assert.equal(money(123450), '$1,234.50');
  assert.equal(money(-500), '-$5.00');
  assert.equal(money(85400, { whole: true }), '$854');
  assert.equal(toCents('12.5'), 1250);
  assert.equal(toCents('$1,299.99'), 129999);
  assert.ok(Number.isNaN(toCents('abc')));
  assert.ok(Number.isNaN(toCents('1.234')));
});
