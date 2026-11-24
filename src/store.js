// The "seen adverts" store. Lives at docs/data/listings.json so the GitHub
// Pages dashboard can read the same file the job commits back to the repo.

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

export const STORE_PATH = 'docs/data/listings.json';

export async function loadStore(path = STORE_PATH) {
  try {
    const store = JSON.parse(await readFile(path, 'utf8'));
    store.adverts ||= {};
    store.searches ||= {};
    store.runs ||= [];
    return store;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return { version: 1, generatedAt: null, searches: {}, adverts: {}, runs: [] };
  }
}

export async function saveStore(store, path = STORE_PATH, { indent = 1 } = {}) {
  await mkdir(dirname(path), { recursive: true });
  // Write to a temporary file and rename so a crash mid-write cannot leave a truncated store.
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, indent) + '\n');
  await rename(tmp, path);
}

/**
 * Merge one search's fresh listings into the store.
 * Returns { added, back, priceDrops, priceRises, gone } for notification.
 *
 * Autotrader's results sometimes leave an advert out for a run and show it again
 * next time. So an advert only counts as gone once a search has missed it on
 * `missesToGone` runs in a row; goneSince is then the first run it was missed.
 * An advert that does come back after being marked gone is reported in `back`,
 * not `added`: it is not a new listing.
 * `complete: false` (the search hit its page limit) records no misses at all.
 */
export function mergeSearchResults(store, searchName, listings, today, { missesToGone = 2, complete = true } = {}) {
  const added = [];
  const back = [];
  const priceDrops = [];
  const priceRises = [];
  const gone = [];
  const seenNow = new Set();

  for (const l of listings) {
    seenNow.add(l.id);
    const existing = store.adverts[l.id];
    if (!existing) {
      store.adverts[l.id] = {
        ...l,
        firstSeen: today,
        lastSeen: today,
        status: 'active',
        searches: [searchName],
        priceHistory: l.price != null ? [{ date: today, price: l.price }] : [],
      };
      added.push(store.adverts[l.id]);
      continue;
    }

    const wasGone = existing.status !== 'active';
    const lastPrice = existing.priceHistory.at(-1)?.price ?? null;
    const alreadyInSearch = existing.searches.includes(searchName);

    Object.assign(existing, l, {
      firstSeen: existing.firstSeen,
      lastSeen: today,
      status: 'active',
      searches: alreadyInSearch ? existing.searches : [...existing.searches, searchName],
      priceHistory: existing.priceHistory,
    });
    delete existing.goneSince;
    if (existing.misses) {
      delete existing.misses[searchName];
      if (!Object.keys(existing.misses).length) delete existing.misses;
    }

    if (l.price != null && lastPrice != null && l.price !== lastPrice) {
      existing.priceHistory.push({ date: today, price: l.price });
      const change = { advert: existing, from: lastPrice, to: l.price };
      (l.price < lastPrice ? priceDrops : priceRises).push(change);
    } else if (l.price != null && lastPrice == null) {
      existing.priceHistory.push({ date: today, price: l.price });
    }

    if (wasGone) back.push(existing);
    else if (!alreadyInSearch) added.push(existing); // new to this search
  }

  // Anything this search used to return but did not today has been missed once more.
  if (!complete) return { added, back, priceDrops, priceRises, gone };
  for (const advert of Object.values(store.adverts)) {
    if (advert.status !== 'active' || !advert.searches.includes(searchName) || seenNow.has(advert.id)) continue;
    advert.misses ||= {};
    const miss = (advert.misses[searchName] ||= { since: today, n: 0 });
    miss.n++;
    if (miss.n < missesToGone) continue;
    advert.searches = advert.searches.filter((s) => s !== searchName);
    delete advert.misses[searchName];
    if (advert.searches.length === 0) {
      advert.status = 'gone';
      advert.goneSince = miss.since;
      delete advert.misses;
      gone.push(advert);
    } else if (!Object.keys(advert.misses).length) delete advert.misses;
  }

  return { added, back, priceDrops, priceRises, gone };
}

/** Drop adverts that have been gone for longer than `keepDays`. */
export function pruneStore(store, today, keepDays = 90) {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - keepDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  let removed = 0;
  for (const [id, advert] of Object.entries(store.adverts)) {
    if (advert.status === 'gone' && advert.goneSince && advert.goneSince < cutoffStr) {
      delete store.adverts[id];
      removed++;
    }
  }
  return removed;
}

/** Remove searches no longer in the config and retire adverts that only they matched. */
export function dropRemovedSearches(store, configuredNames, today) {
  const keep = new Set(configuredNames);
  const removed = Object.keys(store.searches).filter((n) => !keep.has(n));
  for (const n of removed) delete store.searches[n];
  if (!removed.length) return removed;
  for (const advert of Object.values(store.adverts)) {
    advert.searches = advert.searches.filter((s) => keep.has(s));
    if (advert.status === 'active' && advert.searches.length === 0) {
      advert.status = 'gone';
      advert.goneSince = today;
    }
  }
  return removed;
}
