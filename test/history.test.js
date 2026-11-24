import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceAt, liveOn, snapshotFor, updateHistory, updateSoldLog } from '../src/history.js';

const van = (id, extra) => ({ id, make: 'Hymer', model: 'B 678', title: 'Hymer B 678', year: 2019, mileage: 20000, status: 'active', firstSeen: '2026-11-01', listedDate: '2026-11-01', fit: { bodyType: 'Coachbuilt' }, ...extra });

test('price on a day is the last recorded price on or before it', () => {
  const a = van('a', { price: 45000, priceHistory: [{ date: '2026-11-01', price: 50000 }, { date: '2026-11-05', price: 47000 }, { date: '2026-11-09', price: 45000 }] });
  assert.equal(priceAt(a, '2026-11-01'), 50000);
  assert.equal(priceAt(a, '2026-11-07'), 47000);
  assert.equal(priceAt(a, '2026-11-20'), 45000);
  assert.equal(liveOn(a, '2026-10-31'), false);
  assert.equal(liveOn({ ...a, status: 'gone', goneSince: '2026-11-10' }, '2026-11-10'), false);
  assert.equal(liveOn({ ...a, status: 'gone', goneSince: '2026-11-10' }, '2026-11-09'), true);
});

test('the like-for-like index moves only when the same vans are re-priced', () => {
  const a = van('a', { price: 45000, priceHistory: [{ date: '2026-11-01', price: 50000 }, { date: '2026-11-02', price: 45000 }] });
  const b = van('b', { price: 50000, priceHistory: [{ date: '2026-11-01', price: 50000 }] });
  // A dear new arrival on day 2 must not move the index.
  const c = van('c', { price: 90000, firstSeen: '2026-11-02', listedDate: '2026-11-02', priceHistory: [{ date: '2026-11-02', price: 90000 }] });
  const d1 = snapshotFor([a, b, c], '2026-11-01');
  const d2 = snapshotFor([a, b, c], '2026-11-02', d1);
  assert.equal(d1.lfl, 100);
  assert.equal(d2.lfl, 95); // (0.9 + 1.0) / 2
  assert.equal(d2.flows.cuts, 1);
  assert.equal(d2.flows.listed, 1);
  assert.equal(d2.used.n, 3);
});

test('history backfills once, then adds a day per run; the sold log keeps gone adverts once', () => {
  const a = van('a', { price: 45000, priceHistory: [{ date: '2026-11-01', price: 45000 }] });
  const g = van('g', { status: 'gone', goneSince: '2026-11-03', price: 40000, priceHistory: [{ date: '2026-11-01', price: 42000 }, { date: '2026-11-02', price: 40000 }] });
  const h = updateHistory(null, [a, g], '2026-11-04', { backfillFrom: '2026-11-01' });
  assert.deepEqual(Object.keys(h.days).sort(), ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
  assert.equal(h.days['2026-11-01'].backfilled, true);
  assert.equal(h.days['2026-11-04'].backfilled, undefined);
  updateHistory(h, [a, g], '2026-11-05', { backfillFrom: '2026-11-01' });
  assert.equal(Object.keys(h.days).length, 5);
  const log = { version: 1, adverts: {} };
  assert.equal(updateSoldLog(log, [a, g]), 1);
  assert.equal(updateSoldLog(log, [a, g]), 0);
  assert.deepEqual({ first: log.adverts.g.firstPrice, last: log.adverts.g.lastPrice, cuts: log.adverts.g.cuts, days: log.adverts.g.days }, { first: 42000, last: 40000, cuts: 1, days: 2 });
});

test('sold log drops adverts that are back on sale', () => {
  const log = { version: 1, adverts: {} };
  const a = { id: 'x', title: 'Van', make: 'Hymer', status: 'gone', goneSince: '2026-11-20', listedDate: '2026-11-01', price: 50000, priceHistory: [{ date: '2026-11-01', price: 50000 }] };
  assert.equal(updateSoldLog(log, [a]), 1);
  a.status = 'active';
  delete a.goneSince;
  updateSoldLog(log, [a]);
  assert.equal(log.adverts.x, undefined);
});
