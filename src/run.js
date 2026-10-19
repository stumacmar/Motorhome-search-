#!/usr/bin/env node
// Daily job: run every search in search.config.json, record what is new,
// what dropped in price and what disappeared, update the dashboard data and
// send notifications.
//
//   node src/run.js            normal run
//   node src/run.js --dry-run  fetch and report, but do not save or notify

import { readFile } from 'node:fs/promises';
import { fetchSearch, filtersFromUrl, filtersFromCriteria, urlFromFilters } from './autotrader.js';
import { loadStore, saveStore, mergeSearchResults, pruneStore, dropRemovedSearches } from './store.js';
import { slimStore, DASHBOARD_PATH } from './export.js';
import { buildReport, sendTelegram, sendEmail, channelsFromEnv } from './notify.js';
import { fetchAdvertDirect, fetchAdvertViaBrowser } from './advert.js';
import { compileSpecs, matchSpecs, matchRedFlags, compareWithSimilar, scoreDeal, listedDateFromId, inferLength, lengthExclusion, looksUnconverted, DEFAULT_SPECS, DEFAULT_RED_FLAGS } from './spec.js';
import { BrowserTransport } from './autotrader.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch detail pages for live adverts we have not looked at yet (newest first,
 * capped per run), then recompute specs, price-vs-similar and deal flags.
 */
async function enrich(store, config, transport) {
  const maxFetches = rescoreOnly ? 0 : config.details?.maxFetchesPerRun ?? 300;
  const retryAfterDays = config.details?.retryFailedAfterDays ?? 3;
  const delayMs = config.details?.delayMs ?? 900;
  const minBerth = config.details?.excludeIfBerthBelow ?? 2;
  const compiled = compileSpecs(config.specs || DEFAULT_SPECS);
  const compiledFlags = compileSpecs(config.redFlags || DEFAULT_RED_FLAGS);
  const dealConfig = config.deals || {};
  const todayMs = Date.now();

  const pending = Object.values(store.adverts)
    .filter((a) => a.status === 'active' && !a.details)
    .filter((a) => !a.detailsError || todayMs - new Date(a.detailsError.date) > retryAfterDays * 864e5)
    .sort((x, y) => (y.firstSeen || '').localeCompare(x.firstSeen || '') || y.id.localeCompare(x.id))
    .slice(0, maxFetches);

  if (pending.length) console.info(`\nFetching details for ${pending.length} advert(s)`);
  let fetched = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  const started = Date.now();
  for (const [i, advert] of pending.entries()) {
    if (i > 0 && i % 100 === 0) console.info(`  …${i}/${pending.length} after ${Math.round((Date.now() - started) / 60000)} min`);
    try {
      let details;
      if (!transport.browser) {
        try {
          details = await fetchAdvertDirect(advert.id);
        } catch (err) {
          if (!/Cloudflare|HTTP 403/.test(err.message)) throw err;
          console.warn(`  direct advert request blocked (${err.message}); using the headless browser`);
          transport.browser = new BrowserTransport();
          await transport.browser.start();
        }
      }
      if (!details) details = await fetchAdvertViaBrowser(transport.browser, advert.id);
      if (details.gone) {
        advert.detailsError = { date: new Date().toISOString(), message: 'advert page not found' };
        continue;
      }
      delete details._text;
      advert.details = details;
      delete advert.detailsError;
      fetched++;
      consecutiveFailures = 0;
    } catch (err) {
      failed++;
      consecutiveFailures++;
      advert.detailsError = { date: new Date().toISOString(), message: err.message };
      console.warn(`  ${advert.id} ${advert.title}: ${err.message}`);
      if (consecutiveFailures >= 8) {
        console.warn('  eight failures in a row; giving up on detail pages for this run');
        break;
      }
    }
    await sleep(delayMs * (0.7 + Math.random() * 0.6));
  }
  if (pending.length) console.info(`  fetched ${fetched}, failed ${failed}`);

  const lengthRule = config.length || {};
  for (const advert of Object.values(store.adverts)) {
    if (!advert.listedDate) advert.listedDate = listedDateFromId(advert.id) || advert.firstSeen;
    advert.length = inferLength(advert);
    delete advert.excluded;
    delete advert.lengthOutside;
    const outside = lengthExclusion(advert, lengthRule);
    // In "flag" mode an advert outside the length range stays on the dashboard (behind a toggle)
    // so the star spec can be scored across every motorhome; in "hide" mode it is hidden as before.
    if (outside) {
      if (lengthRule.mode === 'flag') advert.lengthOutside = outside;
      else advert.excluded = outside;
    }
    if (!advert.details) continue;
    advert.specs = matchSpecs(advert.details, compiled);
    advert.redFlags = matchRedFlags(advert.details, compiledFlags);
    const berth = Number(advert.details.keySpec?.Berth);
    if (!advert.excluded && minBerth && Number.isFinite(berth) && berth > 0 && berth < minBerth) advert.excluded = `${berth} berth`;
    if (!advert.excluded && looksUnconverted(advert)) advert.excluded = 'no living equipment described';
  }
  const values = compareWithSimilar(Object.values(store.adverts), dealConfig);
  for (const advert of Object.values(store.adverts)) {
    advert.value = values[advert.id] || null;
    advert.deal = advert.status === 'active' ? scoreDeal(advert, dealConfig) : null;
  }
  const skipped = Object.values(store.adverts).filter((a) => a.status === 'active' && !a.details).length - failed;
  return { fetched, failed, stillPending: Math.max(0, skipped) };
}

/** One line per star-spec item: how many live adverts carry it, and how many have the lot. */
function logStarSpec(store) {
  const items = store.wantedSpecs || [];
  if (!items.length) return;
  const live = Object.values(store.adverts).filter((a) => a.status === 'active' && !a.excluded && a.details);
  const count = (label, list) => list.filter((a) => (a.specs || []).some((s) => s.label === label)).length;
  const full = (list) => list.filter((a) => a.deal?.fullStarSpec).length;
  const most = (list) => list.filter((a) => (a.deal?.starCount ?? 0) >= Math.max(1, items.length - 1)).length;
  console.info(`\nStar spec across ${live.length} live adverts read: ` + items.map((l) => `${l} ${count(l, live)}`).join(' · '));
  console.info(`  all ${items.length}: ${full(live)} · at least ${Math.max(1, items.length - 1)}: ${most(live)}`);
  const inRange = live.filter((a) => !a.lengthOutside);
  if (inRange.length !== live.length) {
    console.info(`  within the length range (${inRange.length}): ` + items.map((l) => `${l} ${count(l, inRange)}`).join(' · ') + ` · all ${items.length}: ${full(inRange)}`);
  }
}

const dryRun = process.argv.includes('--dry-run');
const rescoreOnly = process.argv.includes('--rescore'); // recompute kit, value and deal flags from the stored data without touching Autotrader
const configPath = process.argv.find((a) => a.endsWith('.json')) || 'search.config.json';
const today = new Date().toISOString().slice(0, 10);

const wordRe = (k) => new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'i');

function matchesText(advert, { mustContain = [], mustNotContain = [] }) {
  const hay = [advert.title, advert.subTitle, advert.attentionGrabber, advert.make, advert.model].filter(Boolean).join(' ');
  if (mustContain.length && !mustContain.every((k) => wordRe(k).test(hay))) return false;
  if (mustNotContain.some((k) => wordRe(k).test(hay))) return false;
  return true;
}

async function main() {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  if (!Array.isArray(config.searches) || config.searches.length === 0) {
    throw new Error(`${configPath} has no "searches"`);
  }
  const store = await loadStore();
  const results = [];
  const transport = {}; // shared across searches; holds the headless browser if the fallback is needed

  for (const search of rescoreOnly ? [] : config.searches) {
    const name = search.name || search.url || JSON.stringify(search.criteria);
    console.info(`\n▶ ${name}`);
    try {
      const spec = search.url ? filtersFromUrl(search.url) : filtersFromCriteria(search.criteria || {});
      const searchUrl = urlFromFilters(spec.filters, spec.sortBy);
      const fetched = await fetchSearch(spec, { maxPages: search.maxPages ?? config.maxPages ?? 10, transport });

      const listings = fetched.listings.filter((l) => matchesText(l, search));
      const filteredOut = fetched.listings.length - listings.length;
      if (filteredOut) console.info(`  ${filteredOut} excluded by mustContain/mustNotContain`);
      if (fetched.truncated) console.warn(`  only the first ${listings.length} of ${fetched.totalResults} results were read; narrow the search or raise maxPages`);

      const diff = mergeSearchResults(store, name, listings, today);
      store.searches[name] = {
        name,
        url: searchUrl,
        lastRun: today,
        total: fetched.totalResults,
        read: listings.length,
        truncated: fetched.truncated,
        error: null,
      };
      results.push({ name, total: fetched.totalResults, ...diff });
      console.info(`  new ${diff.added.length}, price drops ${diff.priceDrops.length}, rises ${diff.priceRises.length}, gone ${diff.gone.length}`);
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      store.searches[name] = { ...(store.searches[name] || {}), name, lastRun: today, error: err.message };
      results.push({ name, error: err.message, added: [], priceDrops: [], priceRises: [], gone: [], deals: [] });
    }
  }
  let enrichment = { fetched: 0, failed: 0, stillPending: 0 };
  try {
    enrichment = await enrich(store, config, transport);
  } catch (err) {
    console.error(`Detail enrichment failed: ${err.message}`);
  }
  for (const r of results) {
    const candidates = new Map();
    for (const a of r.added) candidates.set(a.id, a);
    for (const c of r.priceDrops) candidates.set(c.advert.id, c.advert);
    r.deals = [...candidates.values()].filter((a) => a.deal?.isDeal);
  }
  await transport.browser?.stop().catch(() => {});

  // Drop searches that were removed from the config, retiring adverts only they matched.
  const configured = config.searches.map((s) => s.name || s.url || JSON.stringify(s.criteria));
  const removed = rescoreOnly ? [] : dropRemovedSearches(store, configured, today);
  if (removed.length) console.info(`\nRemoved searches no longer in config: ${removed.join(', ')}`);

  const pruned = pruneStore(store, today, config.keepGoneDays ?? 90);
  store.wantedSpecs = config.deals?.wantedSpecs || [];
  store.minWantedSpecs = config.deals?.minWantedSpecs ?? 2;
  store.lengthRule = config.length ? { mode: config.length.mode || 'hide', minMetres: config.length.minMetres ?? null, maxMetres: config.length.maxMetres ?? null, hideUnknown: !!config.length.hideUnknown } : null;
  // The day a search first ran: everything it matched that day is backlog, not "new to search".
  // Derived once from the run history for searches that predate this field, then kept.
  for (const s of Object.values(store.searches)) {
    if (s.firstRun) continue;
    const dates = (store.runs || []).filter((r) => r.searches.some((x) => x.name === s.name)).map((r) => r.date.slice(0, 10));
    s.firstRun = dates.length ? dates.sort()[0] : today;
  }
  logStarSpec(store);
  if (rescoreOnly) {
    await saveStore(store);
    await saveStore(slimStore(store), DASHBOARD_PATH, { indent: 0 }); // compact: the page downloads this on every visit
    console.info(`\nRescored ${Object.keys(store.adverts).length} adverts without fetching.`);
    return false;
  }
  store.generatedAt = new Date().toISOString();
  store.runs.unshift({
    date: store.generatedAt,
    searches: results.map((r) => ({
      name: r.name,
      error: r.error || null,
      added: r.added.length,
      priceDrops: r.priceDrops.length,
      gone: r.gone.length,
    })),
  });
  store.runs = store.runs.slice(0, 60);

  const report = buildReport(results, { wantedSpecs: config.deals?.wantedSpecs || [] });
  const dashboardUrl = process.env.DASHBOARD_URL || config.dashboardUrl || null;

  if (dryRun) {
    console.info(`\n--- dry run: not saving or notifying (details fetched ${enrichment.fetched}, failed ${enrichment.failed}) ---`);
    console.info(report.anything ? report.html.replace(/<[^>]+>/g, '') : '(nothing new)');
    return;
  }

  await saveStore(store);
  await saveStore(slimStore(store), DASHBOARD_PATH, { indent: 0 }); // compact: the page downloads this on every visit
  console.info(`\nSaved ${Object.keys(store.adverts).length} adverts (${pruned} pruned, ${enrichment.stillPending} still awaiting details)`);

  const failures = results.filter((r) => r.error).length;
  const allFailed = failures === results.length;
  if (!report.anything) {
    console.info('Nothing new today; no notification sent.');
    return allFailed;
  }

  const channels = channelsFromEnv();
  if (!Object.keys(channels).length) {
    console.info('No notification channel configured (set Telegram or SMTP secrets); dashboard updated only.');
    return allFailed;
  }
  const totalNew = results.reduce((n, r) => n + r.added.length, 0);
  const totalDrops = results.reduce((n, r) => n + r.priceDrops.length, 0);
  const subject = `Motorhome search: ${totalNew} new, ${totalDrops} price drop${totalDrops === 1 ? '' : 's'}${failures ? `, ${failures} search failed` : ''}`;

  if (channels.telegram) {
    const n = await sendTelegram(channels.telegram, report.html, dashboardUrl);
    console.info(`Telegram: sent ${n} message(s)`);
  }
  if (channels.email) {
    await sendEmail(channels.email, report.html, subject, dashboardUrl);
    console.info(`Email: sent to ${channels.email.to || channels.email.user}`);
  }
  return allFailed;
}

main()
  .then((allFailed) => {
    if (allFailed) {
      console.error('\nEvery search failed; see the messages above.');
      process.exitCode = 1;
    }
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
