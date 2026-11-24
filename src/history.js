// Market history: a permanent record of how asking prices move across the
// motorhomes the searches cover. Two files, never pruned (the main store drops
// gone adverts after keepGoneDays, so this is the only long-term memory):
//
//   docs/data/market-history.json  one snapshot per day: prices by model year,
//                                  body, build tier, seller and brand; listing
//                                  flows; price cuts; a like-for-like index.
//   docs/data/sold-log.json        every advert that left the market, with its
//                                  first and last asking price, cuts and days listed.
//
// "Sold" means "left Autotrader": a sale, a withdrawal or a dealer moving it.
// All prices are asking prices within the searches' range (see search.config.json).

import { rateQuality } from './quality.js';

export const HISTORY_PATH = 'docs/data/market-history.json';
export const SOLD_LOG_PATH = 'docs/data/sold-log.json';

const BRAND_MIN = 15; // a brand needs this many live used adverts to get its own line

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo));
};

function summary(adverts, priceOf) {
  const prices = adverts.map(priceOf).filter((p) => p > 0).sort((a, b) => a - b);
  const miles = adverts.map((a) => a.mileage).filter((m) => m != null && m >= 0).sort((a, b) => a - b);
  return { n: prices.length, median: quantile(prices, 0.5), p25: quantile(prices, 0.25), p75: quantile(prices, 0.75), miles: quantile(miles, 0.5) };
}

function group(adverts, keyOf) {
  const out = {};
  for (const a of adverts) {
    const k = keyOf(a);
    if (k == null) continue;
    (out[k] ||= []).push(a);
  }
  return out;
}

export function bodyOf(a) {
  const b = (a.fit?.bodyType || a.details?.bodyType || '').toLowerCase();
  if (/a ?class|integrated/.test(b)) return 'A-class';
  if (/camper|conversion|high top|micro/.test(b)) return 'Campervan';
  if (/coach|motorhome|low profile|overcab|c class/.test(b)) return 'Coachbuilt';
  return null;
}

// The run rates only live adverts; gone ones (still needed for backfilled days and the sold log) are rated here.
const rated = new WeakMap();
const qualityOf = (a) => {
  if (a.quality) return a.quality;
  if (!rated.has(a)) rated.set(a, rateQuality(a));
  return rated.get(a);
};
const QUALITY_TIERS = new Set(['premium', 'upper']);
const tierOf = (a) => (QUALITY_TIERS.has(qualityOf(a).tier) ? 'Premium and upper brands' : 'Other brands');

/** Asking price on a given day: the last price recorded on or before it. */
export function priceAt(advert, day) {
  let p = null;
  for (const h of advert.priceHistory || []) {
    if (h.date <= day) p = h.price;
    else break;
  }
  return p ?? (advert.firstSeen && advert.firstSeen <= day ? advert.price : null);
}

/** Was the advert on the market on that day, as far as the store knows? */
export function liveOn(advert, day) {
  if (!advert.firstSeen || advert.firstSeen > day) return false;
  if (advert.status === 'gone') return !!advert.goneSince && advert.goneSince > day;
  return true;
}

const inScope = (a) => !a.excluded && a.year >= 2000;

/**
 * One day's snapshot of the market. `prev` is the previous snapshot (for the
 * like-for-like index); `all` is every advert in the store.
 */
export function snapshotFor(all, day, prev = null, { backfilled = false } = {}) {
  const live = all.filter((a) => inScope(a) && liveOn(a, day));
  const priceOf = (a) => priceAt(a, day);
  const used = live.filter((a) => !a.newStock);

  // Like-for-like: the same vans' asking prices against the last snapshot. Mean of
  // price ratios, chained, so it moves only when standing stock is re-priced; a shift
  // in what is for sale (more new stock, more A-classes) cannot move it.
  let lfl = 100;
  let lflN = 0;
  if (prev) {
    const ratios = [];
    for (const a of used) {
      const before = priceAt(a, prev.date), now = priceOf(a);
      if (before > 0 && now > 0 && a.firstSeen <= prev.date) ratios.push(now / before);
    }
    lflN = ratios.length;
    const mean = ratios.length ? ratios.reduce((s, r) => s + r, 0) / ratios.length : 1;
    lfl = Math.round((prev.lfl ?? 100) * mean * 1000) / 1000;
  }

  // Flows on the day itself.
  let cuts = 0, rises = 0;
  const cutPcts = [];
  for (const a of all) {
    if (!inScope(a)) continue;
    const h = a.priceHistory || [];
    for (let i = 1; i < h.length; i++) {
      if (h[i].date !== day) continue;
      if (h[i].price < h[i - 1].price) { cuts++; cutPcts.push(((h[i - 1].price - h[i].price) / h[i - 1].price) * 100); }
      else if (h[i].price > h[i - 1].price) rises++;
    }
  }
  cutPcts.sort((a, b) => a - b);
  const listed = all.filter((a) => inScope(a) && a.listedDate === day).length;
  const gone = all.filter((a) => inScope(a) && a.status === 'gone' && a.goneSince === day).length;

  const seg = (by, min = 1) => {
    const out = {};
    for (const [k, list] of Object.entries(group(used, by))) if (list.length >= min) out[k] = summary(list, priceOf);
    return out;
  };

  return {
    date: day,
    ...(backfilled ? { backfilled: true } : {}),
    live: live.length,
    newStock: live.length - used.length,
    used: summary(used, priceOf),
    lfl,
    lflN,
    flows: { listed, gone, cuts, rises, medianCutPct: cutPcts.length ? Math.round(quantile(cutPcts, 0.5) * 10) / 10 : null },
    byYear: seg((a) => (a.year >= 2016 ? String(a.year) : null)),
    byBody: seg(bodyOf),
    byTier: seg(tierOf),
    bySeller: seg((a) => (a.sellerType === 'PRIVATE' ? 'Private' : a.sellerType ? 'Dealer' : null)),
    byBrand: seg((a) => qualityOf(a).brand || null, BRAND_MIN),
  };
}

/** Adds or refreshes today's snapshot; backfills from the store on the first run. */
export function updateHistory(history, all, today, { backfillFrom = null } = {}) {
  history ||= { version: 1, days: {} };
  history.note = 'Asking prices of live adverts in the searches\' range, one snapshot per day. used = excluding new and ex-demo stock. lfl = like-for-like index of the same vans\' asking prices (100 = first day). Backfilled days were rebuilt from stored price histories.';
  const days = Object.keys(history.days).sort();
  if (!days.length && backfillFrom) {
    let prev = null;
    for (let d = backfillFrom; d < today; d = nextDay(d)) {
      prev = snapshotFor(all, d, prev, { backfilled: true });
      history.days[d] = prev;
    }
  }
  const before = Object.keys(history.days).filter((d) => d < today).sort();
  const prev = before.length ? history.days[before[before.length - 1]] : null;
  history.days[today] = snapshotFor(all, today, prev);
  history.updated = today;
  return history;
}

/** Appends every advert that has left the market and is not logged yet. */
export function updateSoldLog(log, all) {
  log ||= { version: 1, adverts: {} };
  log.note = 'Adverts that left Autotrader (sold, withdrawn or moved). Prices are asking prices; days = listing date to the day it was noticed gone.';
  let added = 0;
  for (const a of all) {
    if (a.status !== 'gone' || !a.goneSince || a.excluded || log.adverts[a.id]) continue;
    const h = a.priceHistory || [];
    const first = h[0]?.price ?? a.price;
    let cuts = 0;
    for (let i = 1; i < h.length; i++) if (h[i].price < h[i - 1].price) cuts++;
    const days = a.listedDate ? Math.round((new Date(a.goneSince) - new Date(a.listedDate)) / 864e5) : null;
    log.adverts[a.id] = {
      gone: a.goneSince, listed: a.listedDate || null, title: a.title, make: a.make, model: a.model, year: a.year,
      mileage: a.mileage ?? null, body: bodyOf(a), brand: qualityOf(a).brand || null, tier: qualityOf(a).tier || null,
      seller: a.sellerType || null, newStock: !!a.newStock, length: a.length?.metres ?? null,
      firstPrice: first, lastPrice: a.price, cuts, days: days != null && days >= 0 ? days : null,
    };
    added++;
  }
  log.updated = new Date().toISOString().slice(0, 10);
  return added;
}

function nextDay(d) {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}
