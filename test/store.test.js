import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSearchResults, pruneStore } from '../src/store.js';

const advert = (id, price, extra = {}) => ({ id, title: 'Van ' + id, price, url: 'https://x/' + id, ...extra });

test('first run adds everything as new', () => {
  const store = { adverts: {}, searches: {} };
  const r = mergeSearchResults(store, 'S', [advert('1', 100), advert('2', 200)], '2026-10-01');
  assert.equal(r.added.length, 2);
  assert.equal(store.adverts['1'].priceHistory.length, 1);
  assert.deepEqual(store.adverts['1'].searches, ['S']);
});

test('second run reports only new, drops and gone', () => {
  const store = { adverts: {}, searches: {} };
  mergeSearchResults(store, 'S', [advert('1', 100), advert('2', 200)], '2026-10-01');
  const r = mergeSearchResults(store, 'S', [advert('1', 90), advert('3', 300)], '2026-10-02');
  assert.deepEqual(r.added.map((a) => a.id), ['3']);
  assert.deepEqual(r.priceDrops.map((c) => [c.advert.id, c.from, c.to]), [['1', 100, 90]]);
  assert.deepEqual(r.gone.map((a) => a.id), ['2']);
  assert.equal(store.adverts['2'].status, 'gone');
  assert.equal(store.adverts['2'].goneSince, '2026-10-02');
  assert.equal(store.adverts['1'].priceHistory.length, 2);
  assert.equal(store.adverts['1'].firstSeen, '2026-10-01');
});

test('price rise is recorded but not a drop', () => {
  const store = { adverts: {}, searches: {} };
  mergeSearchResults(store, 'S', [advert('1', 100)], '2026-10-01');
  const r = mergeSearchResults(store, 'S', [advert('1', 110)], '2026-10-02');
  assert.equal(r.priceDrops.length, 0);
  assert.equal(r.priceRises.length, 1);
});

test('advert shared by two searches only goes when both lose it', () => {
  const store = { adverts: {}, searches: {} };
  mergeSearchResults(store, 'A', [advert('1', 100)], '2026-10-01');
  const r1 = mergeSearchResults(store, 'B', [advert('1', 100)], '2026-10-01');
  assert.equal(r1.added.length, 1, 'new to search B counts as new for B');
  assert.deepEqual(store.adverts['1'].searches, ['A', 'B']);
  const r2 = mergeSearchResults(store, 'A', [], '2026-10-02');
  assert.equal(r2.gone.length, 0);
  assert.equal(store.adverts['1'].status, 'active');
  const r3 = mergeSearchResults(store, 'B', [], '2026-10-02');
  assert.equal(r3.gone.length, 1);
});

test('advert that comes back is reported as new again', () => {
  const store = { adverts: {}, searches: {} };
  mergeSearchResults(store, 'S', [advert('1', 100)], '2026-10-01');
  mergeSearchResults(store, 'S', [], '2026-10-02');
  const r = mergeSearchResults(store, 'S', [advert('1', 100)], '2026-10-03');
  assert.equal(r.added.length, 1);
  assert.equal(store.adverts['1'].status, 'active');
  assert.equal(store.adverts['1'].goneSince, undefined);
});

test('prune removes long-gone adverts only', () => {
  const store = { adverts: {}, searches: {} };
  mergeSearchResults(store, 'S', [advert('1', 100), advert('2', 100)], '2026-01-01');
  mergeSearchResults(store, 'S', [advert('2', 100)], '2026-01-02');
  assert.equal(pruneStore(store, '2026-10-01', 90), 1);
  assert.deepEqual(Object.keys(store.adverts), ['2']);
});

test('removing a search from the config retires adverts only it matched', async () => {
  const { dropRemovedSearches } = await import('../src/store.js');
  const store = { adverts: {}, searches: { A: {}, B: {} } };
  mergeSearchResults(store, 'A', [advert('1', 100), advert('2', 100)], '2026-10-01');
  mergeSearchResults(store, 'B', [advert('2', 100)], '2026-10-01');
  assert.deepEqual(dropRemovedSearches(store, ['B'], '2026-10-02'), ['A']);
  assert.equal(store.adverts['1'].status, 'gone');
  assert.equal(store.adverts['2'].status, 'active');
  assert.deepEqual(store.adverts['2'].searches, ['B']);
  assert.deepEqual(Object.keys(store.searches), ['B']);
});
