import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileSpecs, matchSpecs, matchRedFlags, compareWithSimilar, scoreDeal, listedDateFromId, priceDrops, DEFAULT_SPECS, DEFAULT_RED_FLAGS } from '../src/spec.js';
import { parseAdvertHtml } from '../src/advert.js';

test('spec matching finds kit in features and description', () => {
  const details = {
    features: ['Cab air-con', 'Reversing camera', 'Wind Out Canopy'],
    description: 'Fitted with E&P self-levelling system and VB air suspension on the rear. 360 degree camera too. Truma Aventa roof air conditioning.',
    keySpec: { Gearbox: 'Automatic' },
    specs: {},
  };
  const labels = matchSpecs(details, compileSpecs(DEFAULT_SPECS)).map((m) => m.label);
  for (const l of ['Habitation air conditioning', 'Cab air conditioning', 'Self-levelling', 'Rear air suspension', '360° camera', 'Reversing camera', 'Automatic', 'Awning']) {
    assert.ok(labels.includes(l), `expected ${l} in ${labels}`);
  }
  assert.ok(!labels.includes('Solar panel'));
});

test('Alde heating is matched, including the common misspelling, but not other words', () => {
  const has = (description, features = []) => matchSpecs({ features, description, keySpec: {}, specs: {} }, compileSpecs(DEFAULT_SPECS)).some((m) => m.label === 'Alde heating');
  assert.equal(has('The renowned Alde wet central heating system keeps it warm.'), true);
  assert.equal(has('', ['Alde heating']), true);
  assert.equal(has('GRP sides, aldi wet heating, cab aircon'), true);
  assert.equal(has('Truma Combi 4E blown air heating. Near Aldeburgh.'), false);
  assert.equal(has('Weekly shop at Aldi is a short walk away'), false);
});

test('star spec counts the wanted items and knows when the page was not read', async () => {
  const { starSpec } = await import('../src/spec.js');
  const cfg = { wantedSpecs: ['Alde heating', '360° camera', 'Habitation air conditioning', 'Self-levelling'], minWantedSpecs: 2 };
  const two = starSpec({ details: {}, specs: [{ label: 'Alde heating' }, { label: 'Self-levelling' }, { label: 'Solar panel' }] }, cfg);
  assert.deepEqual(two.hits, ['Alde heating', 'Self-levelling']);
  assert.deepEqual(two.missing, ['360° camera', 'Habitation air conditioning']);
  assert.equal(two.count, 2);
  assert.equal(two.of, 4);
  assert.equal(two.full, false);
  assert.equal(two.checked, true);
  const unread = starSpec({ specs: [] }, cfg);
  assert.equal(unread.count, 0);
  assert.equal(unread.checked, false);
  const all = starSpec({ details: {}, specs: cfg.wantedSpecs.map((label) => ({ label })) }, cfg);
  assert.equal(all.full, true);
  const scored = scoreDeal({ details: {}, specs: [{ label: 'Alde heating' }, { label: '360° camera' }], value: null }, cfg, '2026-10-19');
  assert.equal(scored.starCount, 2);
  assert.equal(scored.starOf, 4);
  assert.deepEqual(scored.starMissing, ['Habitation air conditioning', 'Self-levelling']);
  assert.equal(scored.fullStarSpec, false);
  assert.equal(scored.highSpec, true, 'two star items meets minWantedSpecs');
  assert.equal(scored.isDeal, true);
});

test('notification shows the star spec line', async () => {
  const { starText } = await import('../src/notify.js');
  const wanted = ['Alde heating', '360° camera', 'Habitation air conditioning', 'Self-levelling'];
  assert.equal(starText({ details: {}, specs: [{ label: 'Alde heating' }, { label: 'Awning' }, { label: 'Self-levelling' }] }, wanted), '★★☆☆ 2/4 star spec: Alde heating, Self-levelling');
  assert.equal(starText({ details: {}, specs: [] }, wanted), '☆☆☆☆ 0/4 star spec');
  assert.equal(starText({ specs: [] }, wanted), null, 'no line when the page has not been read');
});

test('cab-only air con is not habitation air con', () => {
  const labels = matchSpecs({ features: ['Air Conditioning'], description: 'Lovely van.', keySpec: {}, specs: {} }, compileSpecs(DEFAULT_SPECS)).map((m) => m.label);
  assert.ok(labels.includes('Cab air conditioning'));
  assert.ok(!labels.includes('Habitation air conditioning'));
});

test('red flags', () => {
  const flags = matchRedFlags({ features: [], description: 'LHD import, some damp in the rear.', keySpec: {}, specs: {}, owners: 5, historyCheck: 'PASSED' }, compileSpecs(DEFAULT_RED_FLAGS)).map((f) => f.label);
  assert.deepEqual(flags, ['Left-hand drive', 'Imported', 'Damp mentioned', '5 owners']);
});

test('damp is flagged only when it is said to be present', () => {
  const damp = (description) => matchRedFlags({ features: [], description, keySpec: {}, specs: {} }, compileSpecs(DEFAULT_RED_FLAGS)).some((f) => f.label === 'Damp mentioned');
  for (const ok of ['10 year water ingress warranty', '100% dry - no damp found during cab check', 'comes with a full damp report', 'habcheck confirmed no damp and all equipment working', 'aluminium composite bodyshell, strong and damp-resistant', 'damp check 20 May 2026 - no issues reported', 'the damp check was all clear', 'damp checked', 'has never had damp', 'no evidence of damp']) {
    assert.equal(damp(ok), false, `should not flag: ${ok}`);
  }
  for (const bad of ['isolated area of damp, measuring 22-40% in rear lower panel', 'slight sign of damp round the bottom of the dining area', 'some damp in the rear washroom', 'damp readings of 30% in the floor', 'damp repaired in 2023']) {
    assert.equal(damp(bad), true, `should flag: ${bad}`);
  }
});

test('comparison with similar adverts: model tier with median when few comps', () => {
  const mk = (id, make, model, year, price, extra = {}) => ({ id, make, model, year, price, status: 'active', ...extra });
  const adverts = [
    mk('a', 'Adria', 'Twin 600', 2020, 40000),
    mk('b', 'Adria', 'Twin 600', 2021, 50000),
    mk('c', 'Adria', 'Twin 600', 2019, 52000),
    mk('d', 'Adria', 'Twin 600', 2022, 54000),
    mk('e', 'Adria', 'Matrix', 2020, 60000),
    mk('x', 'Hymer', 'Free', 2020, 70000),
  ];
  const r = compareWithSimilar(adverts, { minComparables: 3 });
  assert.equal(r.a.basis, 'model');
  assert.equal(r.a.comps, 3);
  assert.equal(r.a.adjusted, false);
  assert.equal(r.a.expected, 52000);
  assert.ok(r.a.pct < -20);
  assert.equal(r.e, undefined);
  assert.equal(r.x, undefined);
});

test('comparison is net of kit and adjusts for age and mileage with enough comps', () => {
  const adverts = [];
  for (let i = 0; i < 24; i++) {
    const year = 2016 + (i % 6);
    const mileage = 20000 + i * 5000;
    const age = 2026 - year;
    adverts.push({ id: 'c' + i, make: 'Hymer', model: 'Free 600', year, mileage, price: Math.round(70000 - 3000 * age - 0.1 * mileage), status: 'active' });
  }
  // Same as c0 (2016, 20k) but with £5,500 of levelling and priced £2,000 under the bare equivalent.
  const bare = 70000 - 3000 * 10 - 0.1 * 20000;
  adverts.push({ id: 'me', make: 'Hymer', model: 'Free 600', year: 2016, mileage: 20000, price: bare + 5500 - 2000, status: 'active', specs: [{ label: 'Self-levelling', value: 5500 }] });
  const r = compareWithSimilar(adverts);
  assert.equal(r.me.adjusted, true);
  assert.ok(r.me.pct < -4 && r.me.pct > -7, `expected about -5%, got ${r.me.pct}`);
});

test('listing date from advert id', () => {
  assert.equal(listedDateFromId('202610116891109', new Date('2026-10-11T12:00:00Z')), '2026-10-11');
  assert.equal(listedDateFromId('202308311396111', new Date('2026-10-11T12:00:00Z')), '2023-08-31');
  assert.equal(listedDateFromId('202613016891109', new Date('2026-10-11T12:00:00Z')), null);
  assert.equal(listedDateFromId('abc', new Date()), null);
});

test('deal scoring with motivation and red flags', () => {
  const cfg = { wantedSpecs: ['Habitation air conditioning', 'Self-levelling'], minWantedSpecs: 2, underpricedPercent: 10, staleDays: 90, motivatedScore: 40, dealScore: 50 };
  const today = '2026-10-11';
  assert.equal(scoreDeal({ specs: [{ label: 'Self-levelling' }], value: { pct: -12 } }, cfg, today).isDeal, true);
  assert.equal(scoreDeal({ specs: [{ label: 'Habitation air conditioning' }, { label: 'Self-levelling' }], value: null }, cfg, today).isDeal, true);
  assert.equal(scoreDeal({ specs: [{ label: 'Self-levelling' }], value: { pct: -5 } }, cfg, today).isDeal, false);
  const stale = scoreDeal({ listedDate: '2026-07-01', priceHistory: [{ date: '2026-07-01', price: 50000 }, { date: '2026-09-01', price: 47000 }], value: null }, cfg, today);
  assert.equal(stale.motivated, true);
  assert.equal(stale.daysListed, 102);
  assert.equal(stale.listedReliable, true);
  assert.ok(stale.desperation > 40 && stale.desperation < 50, `desperation ${stale.desperation}`);
  assert.equal(stale.isDeal, false, 'motivated but under the deal score');
  const twoCuts = scoreDeal({ listedDate: '2026-06-01', priceHistory: [{ price: 50000 }, { price: 48000 }, { price: 45500 }], value: null }, cfg, today);
  assert.equal(twoCuts.motivated, true);
  assert.ok(twoCuts.desperation >= 70, `desperation ${twoCuts.desperation}`);
  assert.equal(twoCuts.isDeal, true, 'two real cuts totalling 9% is worth a look');
  const longListed = scoreDeal({ listedDate: '2026-03-01', priceHistory: [{ date: '2026-10-11', price: 50000 }], value: null, sellerType: 'PRIVATE' }, cfg, today);
  assert.equal(longListed.motivated, true, 'a private seller seven months in counts');
  assert.equal(longListed.desperation, 40);
  assert.equal(longListed.isDeal, false, 'but time alone is not a deal');
  const dealerSat = scoreDeal({ listedDate: '2026-03-01', priceHistory: [{ date: '2026-10-11', price: 50000 }], value: null, sellerType: 'TRADE', year: 2019 }, cfg, today);
  assert.equal(dealerSat.motivated, false, 'dealer stock sat at the same price is not motivated');
  assert.equal(dealerSat.desperation, 30);
  const dealerOld = scoreDeal({ listedDate: '2023-04-26', priceHistory: [{ price: 50000 }], value: null, sellerType: 'TRADE', year: 2019 }, cfg, today);
  assert.equal(dealerOld.listedReliable, false, 'a dealer record older than two years is not trusted');
  assert.equal(dealerOld.desperation, 0);
  const preReg = scoreDeal({ listedDate: '2025-12-16', priceHistory: [{ price: 50000 }], value: null, sellerType: 'TRADE', year: 2026 }, cfg, today);
  assert.equal(preReg.listedReliable, false, 'an advert created before the van was registered is not trusted');
  assert.equal(preReg.desperation, 0);
  const fresh = scoreDeal({ listedDate: '2026-10-10', priceHistory: [{ date: '2026-10-11', price: 50000 }], value: null }, cfg, today);
  assert.equal(fresh.motivated, false);
  assert.equal(fresh.desperation, 0);
  const flagged = scoreDeal({ value: { pct: -30 }, redFlags: [{ label: 'Damp mentioned' }] }, cfg, today);
  assert.equal(flagged.underpriced, true);
  assert.equal(flagged.isDeal, false);
  assert.deepEqual(priceDrops({ priceHistory: [{ price: 100 }, { price: 90 }, { price: 95 }, { price: 80 }] }), { drops: 2, totalDropPct: -20 });
});

test('advert page parser', () => {
  const advert = {
    featuresWithDisclaimer: { features: [{ items: [{ name: 'Cab air-con' }, { name: 'Solar Panel' }] }] },
    keySpecification: [{ label: 'Owners', value: '2' }, { label: 'Gearbox', value: 'Automatic' }],
    specs: [{ items: [{ name: 'Chassis make', value: 'Fiat' }, { name: 'Chassis model', value: 'Ducato' }, { name: 'Body type', value: 'Van Conversion' }] }],
    description: { text: ['Lovely van.', 'Full service history.'] },
    history: { ownersData: { value: '2' }, serviceHistory: { description: 'Full service history', historyType: 'FULL' }, vehicleCheck: { status: 'PASSED', statusText: '10 checks passed' } },
    details: { pricing: { marketPriceRating: { value: 'NOANALYSIS' } }, vehicle: { imported: 'False' } },
  };
  const hydration = JSON.stringify({ loaderData: { 'motorhome-details': { aggregatorAdvert: advert } } });
  const html = `<script>window.__staticRouterHydrationData = JSON.parse(${JSON.stringify(hydration)});</script>`;
  const d = parseAdvertHtml(html);
  assert.deepEqual(d.features, ['Cab air-con', 'Solar Panel']);
  assert.equal(d.chassis, 'Fiat Ducato');
  assert.equal(d.bodyType, 'Van Conversion');
  assert.equal(d.owners, 2);
  assert.equal(d.serviceHistory, 'Full service history');
  assert.equal(d.historyCheck, 'PASSED (10 checks passed)');
  assert.throws(() => parseAdvertHtml('<title>Just a moment...</title>'), /Cloudflare/);
});

test('length inference', async () => {
  const { inferLength, lengthExclusion } = await import('../src/spec.js');
  const rule = { minMetres: 6.25, maxMetres: 7 };
  const cases = [
    [{ title: 'Volkswagen Transporter', subTitle: '2.0 TDI T30 Campervan SWB' }, 5.0, 'VW Transporter class'],
    [{ title: 'Fiat Ducato', subTitle: '2.3 Multijet L4H2 Campervan' }, 6.36, 'ducato L4'],
    [{ title: 'Peugeot Boxer', subTitle: 'L3 H2 Camper' }, 5.99, 'boxer L3'],
    [{ title: 'Mercedes-Benz Sprinter', subTitle: '314 CDI LWB Camper' }, 6.97, 'sprinter LWB'],
    [{ title: 'Auto-Sleepers Kingham', details: { specs: { 'Exterior length': '6,360mm' } } }, 6.36, 'spec sheet'],
    [{ title: 'Swift Escape 694', details: { description: 'Overall length 7.49m, 4 berth.' } }, 7.49, 'stated in advert'],
    [{ title: 'Adria Twin 640', details: { description: 'This van is 6.36 metres long and sleeps two.' } }, 6.36, 'stated in advert'],
    [{ title: 'Ford Transit', subTitle: '2.0 EcoBlue 350 L4 H3 Camper' }, 6.7, 'transit L4'],
    [{ title: 'Hymer Free 600', subTitle: 'Campervan', details: { chassis: 'Fiat Ducato' } }, null, null],
  ];
  for (const [advert, metres, source] of cases) {
    const r = inferLength(advert);
    if (metres == null) assert.equal(r, null, advert.title);
    else {
      assert.ok(r, `no length for ${advert.title}`);
      assert.equal(r.metres, metres, `${advert.title}: ${JSON.stringify(r)}`);
      assert.equal(r.source, source, advert.title);
    }
  }
  assert.equal(lengthExclusion({ length: { metres: 5.0, source: 'x' } }, rule), '5 m (x)');
  assert.equal(lengthExclusion({ length: { metres: 6.36, source: 'x' } }, rule), null);
  assert.equal(lengthExclusion({ length: { metres: 7.49, source: 'x' } }, rule), '7.49 m (x)');
  assert.equal(lengthExclusion({}, rule), null);
  assert.equal(lengthExclusion({}, { ...rule, hideUnknown: true }), 'length unknown');
});

test('unconverted van detection', async () => {
  const { looksUnconverted } = await import('../src/spec.js');
  assert.equal(looksUnconverted({ details: { features: ['Bluetooth', 'Ply lined'], description: 'Clean panel van, one owner, long MOT.', keySpec: {}, specs: {} } }), true);
  assert.equal(looksUnconverted({ details: { features: [], description: 'Full conversion with fixed bed, hob and leisure battery.', keySpec: {}, specs: {} } }), false);
  assert.equal(looksUnconverted({ details: { features: [], description: 'Nothing said.', keySpec: { Berth: '2' }, specs: {} } }), false);
  assert.equal(looksUnconverted({}), false);
});

test('seller signals are matched and feed the desperation score', async () => {
  const { matchSignals, DEFAULT_SIGNALS } = await import('../src/spec.js');
  const sig = (description, extra = {}) => matchSignals({ features: [], description, keySpec: {}, specs: {}, ...extra }, compileSpecs(DEFAULT_SIGNALS)).map((s) => s.label);
  assert.deepEqual(sig('£45,000 ONO. Reluctant sale due to ill health. Part exchange welcome.'), ['Open to offers', 'Needs a quick sale', 'Part exchange welcome']);
  assert.deepEqual(sig('One owner from new, cam belt done at 40k, 12 months warranty, habitation check Sept 2026.'), ['One owner', 'Cam belt done', 'Warranty included', 'Habitation check']);
  assert.deepEqual(sig('Lovely van, viewing recommended.', { owners: 1 }), ['One owner']);
  assert.deepEqual(sig('Lovely van, viewing recommended.'), []);
  const cfg = { wantedSpecs: [], minWantedSpecs: 2, underpricedPercent: 10, staleDays: 90, motivatedScore: 40, dealScore: 50, staleNoCutDays: 50 };
  const today = '2026-10-20';
  const talker = scoreDeal({ details: {}, listedDate: '2026-10-01', priceHistory: [{ date: '2026-10-19', price: 50000 }], sellerType: 'PRIVATE', signals: [{ label: 'Needs a quick sale', weight: 15 }, { label: 'Open to offers', weight: 10 }] }, cfg, today);
  assert.equal(talker.desperation, 35, 'private 10 + signals 25');
  assert.ok(talker.motivationReasons.includes('needs a quick sale'));
  assert.equal(talker.motivated, false, 'under the motivated score');
  const stale = scoreDeal({ details: {}, listedDate: '2026-08-20', firstSeen: '2026-09-20', priceHistory: [{ date: '2026-09-20', price: 50000 }], sellerType: 'TRADE', year: 2019 }, cfg, today);
  assert.equal(stale.staleNoCut, true, '61 days listed, watched 30, no cut');
  const justWatched = scoreDeal({ details: {}, listedDate: '2026-08-20', firstSeen: '2026-10-15', priceHistory: [{ date: '2026-10-15', price: 50000 }], sellerType: 'TRADE', year: 2019 }, cfg, today);
  assert.equal(justWatched.staleNoCut, false, 'only watched five days, earlier cuts would be invisible');
  const cut = scoreDeal({ details: {}, listedDate: '2026-08-20', firstSeen: '2026-09-20', priceHistory: [{ date: '2026-09-20', price: 50000 }, { date: '2026-10-19', price: 48000 }], sellerType: 'TRADE', year: 2019 }, cfg, today);
  assert.equal(cut.staleNoCut, false);
  const kit = scoreDeal({ details: {}, specs: [{ label: 'Alde heating' }, { label: 'Solar panel' }, { label: 'Tow bar' }], priceHistory: [] }, { ...cfg, wantedSpecs: ['Alde heating', '360° camera'], niceToHave: ['Solar panel', 'Tow bar', 'Lithium battery'] }, today);
  assert.equal(kit.kitScore, 5, 'one star item (3) plus two nice-to-haves');
  assert.deepEqual(kit.niceHits, ['Solar panel', 'Tow bar']);
});

test('market intelligence: new stock, days to sell, sold benchmark, re-listing', async () => {
  const { isNewStock, sellDaysStats, typicalSellDays, goneBenchmark, findRelisted } = await import('../src/market.js');
  assert.equal(isNewStock({ year: 2026, mileage: null, sellerType: 'TRADE' }, 2026), true);
  assert.equal(isNewStock({ year: 2025, mileage: 120, sellerType: 'TRADE' }, 2026), true);
  assert.equal(isNewStock({ year: 2025, mileage: 900, sellerType: 'TRADE' }, 2026), true, 'delivery mileage');
  assert.equal(isNewStock({ year: 2025, mileage: 8000, sellerType: 'TRADE' }, 2026), false);
  assert.equal(isNewStock({ year: 2026, mileage: null, sellerType: 'PRIVATE' }, 2026), false);

  const gone = (id, make, model, year, listed, goneSince, price, mileage = 20000, extra = {}) => ({ id, make, model, year, listedDate: listed, goneSince, status: 'gone', sellerType: 'PRIVATE', mileage, priceHistory: [{ date: listed, price }], ...extra });
  const adverts = [];
  for (let i = 0; i < 6; i++) adverts.push(gone('g' + i, 'Swift', 'Escape 694', 2019 + (i % 2), '2026-08-01', `2026-08-${String(10 + i * 4).padStart(2, '0')}`, 40000 + i * 1000));
  for (let i = 0; i < 9; i++) adverts.push(gone('m' + i, 'Swift', 'Other', 2018, '2026-07-01', '2026-09-01', 30000));
  const live = { id: 'L', make: 'Swift', model: 'Escape 694', year: 2020, status: 'active', price: 38000, mileage: 20100, listedDate: '2026-10-01', registeredYear: '2020 (20 reg)' };
  adverts.push(live);
  const stats = sellDaysStats(adverts);
  assert.equal(stats.byModel['swift|escape 694'].n, 6);
  assert.equal(stats.byModel['swift|escape 694'].median, 19);
  assert.equal(stats.byMake.swift.median, 62);
  assert.deepEqual(typicalSellDays(live, stats), { median: 19, n: 6, basis: 'model' });
  assert.deepEqual(typicalSellDays({ make: 'Swift', model: 'Unknown' }, stats), { median: 62, n: 15, basis: 'make' });
  assert.equal(typicalSellDays({ make: 'Hymer', model: 'B' }, stats), null, 'not enough across the market yet');
  const bench = goneBenchmark(adverts);
  assert.equal(bench.L.n, 6);
  assert.equal(bench.L.median, 42500);
  assert.equal(bench.L.pct, -10.6);
  // the live advert matches g5 (same model, year 2020, mileage within 300) which went off sale
  adverts[5].mileage = 20000; adverts[5].year = 2020; adverts[5].registeredYear = '2020 (20 reg)';
  const r = findRelisted(live, adverts);
  assert.equal(r.of, 'g5');
  assert.equal(r.lastPrice, 45000);
  assert.equal(findRelisted({ ...live, mileage: 31000 }, adverts), null, 'mileage too different');
});

test('fit facts are parsed from the spec sheet and placeholders dropped', async () => {
  const { parseFit } = await import('../src/market.js');
  const f = parseFit({ title: 'Fiat Ducato', details: { keySpec: { Berth: '4', Seats: '4', Gearbox: 'Automatic', 'Engine size power': '2.2L (140BHP)', GVW: 'MTPLM: 3,500kg', 'Emission class': 'Euro 6', 'End layout': 'End bedroom', 'Bedroom layout': 'Drop-down bed', Dimensions: 'L:6,990mm x W:2,350mm x H:2,900mm' }, specs: { MTPLM: '3,500kg', Payload: '3,500kg', Height: '2,000mm', Width: '2,350mm' }, bodyType: 'Low Profile' } });
  assert.equal(f.mtplmKg, 3500);
  assert.equal(f.payloadKg, null, 'a 3,500 kg payload is the MTPLM in the wrong box');
  assert.equal(f.heightM, 2.9, '2,000 mm is a form default; the dimensions line is used instead');
  assert.equal(f.bhp, 140);
  assert.equal(f.engineL, 2.2);
  assert.equal(f.gearbox, 'Automatic');
  assert.equal(f.berth, 4);
  assert.equal(f.euro, 6);
  assert.equal(f.bedLayout, 'Drop-down bed');
  assert.equal(parseFit({ details: { keySpec: {}, specs: {} } }).mtplmKg, null);
  assert.equal(parseFit({}), null);
});

test('pick score rewards star spec, price, motivation and provenance, and punishes red flags', () => {
  const cfg = { wantedSpecs: ['Alde heating', '360° camera', 'Habitation air conditioning', 'Self-levelling'], minWantedSpecs: 2, niceToHave: ['Solar panel'], underpricedPercent: 10, staleDays: 90, motivatedScore: 40, dealScore: 50 };
  const today = '2026-10-20';
  const bare = scoreDeal({ details: {}, specs: [], priceHistory: [], value: null, year: 2018, mileage: 60000 }, cfg, today);
  assert.equal(bare.pickScore, 9, 'unknown price comparison (8) plus modest mileage for its age (1)');
  const good = scoreDeal({ details: { serviceHistory: 'Full service history' }, specs: [{ label: 'Alde heating' }, { label: 'Habitation air conditioning' }, { label: 'Self-levelling' }, { label: 'Solar panel' }], value: { pct: -12, comps: 10 }, soldRef: { pct: -8, n: 4 }, year: 2024, mileage: 9000, sellerType: 'PRIVATE', listedDate: '2026-10-10', priceHistory: [{ date: '2026-10-10', price: 60000 }], signals: [{ label: 'One owner', weight: 0 }] }, cfg, today);
  // star 3/4 = 26.25, nice 2.5, price -10% = 16, motivation 10/100 = 1.5, provenance private 3 + fsh 3 + one owner 2 + low miles 3 + young 2 capped at 10
  assert.equal(good.pickScore, 56);
  assert.ok(good.pickParts.some((p) => p.label === 'star spec 3/4' && p.pts === 26.3), JSON.stringify(good.pickParts));
  const flagged = scoreDeal({ details: {}, specs: cfg.wantedSpecs.map((label) => ({ label })), value: { pct: -20 }, redFlags: [{ label: 'Damp mentioned' }], priceHistory: [] }, cfg, today);
  assert.ok(flagged.pickScore < 35, `red flag should cost 25: ${flagged.pickScore}`);
  assert.ok(flagged.pickParts.some((p) => p.label === 'red flag: Damp mentioned' && p.pts === -25));
  const unread = scoreDeal({ specs: [], priceHistory: [], value: { pct: 0 } }, cfg, today);
  assert.ok(unread.pickParts.some((p) => /not read yet/.test(p.label)));
});
