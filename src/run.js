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
import { buildReport, sendTelegram, sendEmail, channelsFromEnv } from './notify.js';

const dryRun = process.argv.includes('--dry-run');
const configPath = process.argv.find((a) => a.endsWith('.json')) || 'search.config.json';
const today = new Date().toISOString().slice(0, 10);

function matchesText(advert, { mustContain = [], mustNotContain = [] }) {
  const hay = [advert.title, advert.subTitle, advert.attentionGrabber].filter(Boolean).join(' ').toLowerCase();
  if (mustContain.length && !mustContain.every((k) => hay.includes(k.toLowerCase()))) return false;
  if (mustNotContain.some((k) => hay.includes(k.toLowerCase()))) return false;
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

  for (const search of config.searches) {
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
      results.push({ name, error: err.message, added: [], priceDrops: [], priceRises: [], gone: [] });
    }
  }
  await transport.browser?.stop().catch(() => {});

  // Drop searches that were removed from the config, retiring adverts only they matched.
  const configured = config.searches.map((s) => s.name || s.url || JSON.stringify(s.criteria));
  const removed = dropRemovedSearches(store, configured, today);
  if (removed.length) console.info(`\nRemoved searches no longer in config: ${removed.join(', ')}`);

  const pruned = pruneStore(store, today, config.keepGoneDays ?? 90);
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

  const report = buildReport(results);
  const dashboardUrl = process.env.DASHBOARD_URL || config.dashboardUrl || null;

  if (dryRun) {
    console.info('\n--- dry run: not saving or notifying ---');
    console.info(report.anything ? report.html.replace(/<[^>]+>/g, '') : '(nothing new)');
    return;
  }

  await saveStore(store);
  console.info(`\nSaved ${Object.keys(store.adverts).length} adverts (${pruned} pruned)`);

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
