// Market intelligence worked out from the store as a whole: how fast things
// sell, what similar vans were asking when they went, re-listed adverts,
// new stock, and the spec-sheet facts that decide whether a van fits.

import { daysBetween, listedDateReliable } from './spec.js';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const modelKey = (a) => (a.make && a.model ? `${norm(a.make)}|${norm(a.model)}` : null);
const makeKey = (a) => (a.make ? norm(a.make) : null);

function median(nums) {
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

/** New or ex-demo stock: this year's or last year's van with delivery mileage, from a dealer. */
export function isNewStock(advert, thisYear = new Date().getFullYear()) {
  if (advert.sellerType === 'PRIVATE' || advert.year == null) return false;
  return advert.year >= thisYear - 1 && (advert.mileage == null || advert.mileage < 1000);
}

// ---------------------------------------------------------------------------
// Days to sell. A gone advert's life is from the listing date in its id to the
// day the job noticed it had gone. Only trustworthy listing dates count.

export function sellDaysStats(adverts) {
  const byModel = {};
  const byMake = {};
  const all = [];
  for (const a of adverts) {
    if (a.status !== 'gone' || !a.goneSince || !a.listedDate) continue;
    const days = daysBetween(a.listedDate, a.goneSince);
    if (!(days >= 0) || !listedDateReliable(a, days)) continue;
    all.push(days);
    const mk = modelKey(a);
    if (mk) (byModel[mk] ||= []).push(days);
    const k = makeKey(a);
    if (k) (byMake[k] ||= []).push(days);
  }
  const summarise = (groups) => Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, { median: median(v), n: v.length }]));
  return { byModel: summarise(byModel), byMake: summarise(byMake), all: all.length ? { median: median(all), n: all.length } : null };
}

/** How long adverts like this one usually last: same model, else same make, else the whole market. */
export function typicalSellDays(advert, stats, { minModel = 5, minMake = 8, minAll = 30 } = {}) {
  if (!stats) return null;
  const mk = modelKey(advert);
  if (mk && stats.byModel[mk]?.n >= minModel) return { ...stats.byModel[mk], basis: 'model' };
  const k = makeKey(advert);
  if (k && stats.byMake[k]?.n >= minMake) return { ...stats.byMake[k], basis: 'make' };
  if (stats.all?.n >= minAll) return { ...stats.all, basis: 'market' };
  return null;
}

// ---------------------------------------------------------------------------
// What similar vans were asking when they went off sale. Asking price at the
// point of sale is closer to what was paid than a live asking price.

export function goneBenchmark(adverts, { minComparables = 3, yearSpan = 2 } = {}) {
  const gone = adverts.filter((a) => a.status === 'gone' && a.year != null && (a.priceHistory || []).length);
  const groups = new Map();
  for (const a of gone) {
    const mk = modelKey(a);
    if (!mk) continue;
    if (!groups.has(mk)) groups.set(mk, []);
    groups.get(mk).push({ year: a.year, price: a.priceHistory.at(-1).price });
  }
  const result = {};
  for (const a of adverts) {
    if (a.status !== 'active' || a.price == null || a.year == null) continue;
    const mk = modelKey(a);
    const comps = (groups.get(mk) || []).filter((c) => Math.abs(c.year - a.year) <= yearSpan);
    if (comps.length < minComparables) continue;
    const med = median(comps.map((c) => c.price));
    result[a.id] = { median: med, n: comps.length, pct: Math.round(((a.price - med) / med) * 1000) / 10 };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Re-listed adverts: the same van back under a new advert id (a sale that fell
// through, a returned van, or a dealer resetting the listing age).

export function findRelisted(advert, adverts) {
  // A dealer's identical new vans are not re-listings of each other.
  if (advert.status !== 'active' || advert.newStock || !advert.make || advert.year == null) return null;
  const mk = modelKey(advert);
  let best = null;
  for (const g of adverts) {
    if (g.status !== 'gone' || g.newStock || g.id === advert.id || g.year !== advert.year || modelKey(g) !== mk) continue;
    if (g.registeredYear && advert.registeredYear && g.registeredYear !== advert.registeredYear) continue;
    const m1 = advert.mileage, m2 = g.mileage;
    if (m1 == null || m2 == null || Math.abs(m1 - m2) > Math.max(300, m1 * 0.01)) continue;
    if (g.listedDate && advert.listedDate && g.listedDate > advert.listedDate) continue; // the old advert must be the older one
    if (!best || (g.goneSince || '') > (best.goneSince || '')) best = g;
  }
  if (!best) return null;
  return { of: best.id, goneSince: best.goneSince, listedDate: best.listedDate, lastPrice: best.priceHistory?.at(-1)?.price ?? best.price ?? null };
}

// ---------------------------------------------------------------------------
// Fit: the spec-sheet facts that decide whether a van is even a candidate.

const num = (s) => {
  const m = /-?[\d,]+(?:\.\d+)?/.exec(String(s ?? ''));
  return m ? parseFloat(m[0].replace(/,/g, '')) : null;
};
const kg = (s) => {
  const n = num(s);
  return n != null && n >= 500 && n <= 7500 ? Math.round(n) : null;
};
const metres = (s) => {
  const n = num(s);
  if (n == null) return null;
  const m = n > 100 ? n / 1000 : n;
  return m >= 1 && m <= 12 ? Math.round(m * 100) / 100 : null;
};
const bhpOf = (s) => {
  const m = /(\d{2,3})\s*(bhp|hp|ps)\b/i.exec(String(s ?? ''));
  return m ? Number(m[1]) : null;
};

/** Structured facts from Autotrader's spec sheet. Placeholder values dealers leave in (2,000 mm high, a 3,500 kg "payload") are dropped. */
export function parseFit(advert) {
  const d = advert.details;
  if (!d) return null;
  const k = d.keySpec || {};
  const sp = d.specs || {};
  const text = `${advert.title || ''} ${advert.subTitle || ''} ${k['Engine size power'] || ''} ${sp['Engine power'] || ''}`;
  const dims = String(k.Dimensions || '');
  const hDim = /H:([\d,]+)\s*mm/i.exec(dims);
  const mtplm = kg(sp.MTPLM) ?? kg(sp['Gross vehicle weight']) ?? kg(k.GVW);
  let payload = kg(sp.Payload) ?? kg(sp['Max loading weight']);
  if (payload != null && payload >= 2000) payload = null; // the MTPLM typed into the wrong box
  // "2,000mm" is a form default, not a motorhome, so take the first stated height that is plausible.
  const height = [metres(sp.Height), hDim ? metres(hDim[1]) : null].find((h) => h != null && h >= 2.3) ?? null;
  const berth = num(k.Berth);
  const seats = num(k.Seats ?? sp.Seats);
  const euro = /euro\s*(\d)/i.exec(k['Emission class'] || '');
  return {
    mtplmKg: mtplm,
    payloadKg: payload,
    heightM: height,
    widthM: metres(sp.Width),
    bhp: bhpOf(text),
    engineL: (() => { const m = /(\d\.\d)\s*l\b/i.exec(k['Engine size power'] || ''); return m ? Number(m[1]) : null; })(),
    berth: berth != null && berth >= 1 && berth <= 10 ? berth : null,
    seats: seats != null && seats >= 1 && seats <= 9 ? seats : null,
    gearbox: /auto/i.test(k.Gearbox || '') ? 'Automatic' : /manual/i.test(k.Gearbox || '') ? 'Manual' : null,
    bedLayout: k['Bedroom layout'] || sp['Bed Layout'] || null,
    endLayout: k['End layout'] || null,
    bodyType: d.bodyType || null,
    euro: euro ? Number(euro[1]) : null,
    drive: sp['Transmission drive'] || null,
  };
}
