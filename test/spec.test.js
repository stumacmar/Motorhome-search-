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

test('cab-only air con is not habitation air con', () => {
  const labels = matchSpecs({ features: ['Air Conditioning'], description: 'Lovely van.', keySpec: {}, specs: {} }, compileSpecs(DEFAULT_SPECS)).map((m) => m.label);
  assert.ok(labels.includes('Cab air conditioning'));
  assert.ok(!labels.includes('Habitation air conditioning'));
});

test('red flags', () => {
  const flags = matchRedFlags({ features: [], description: 'LHD import, some damp in the rear.', keySpec: {}, specs: {}, owners: 5, historyCheck: 'PASSED' }, compileSpecs(DEFAULT_RED_FLAGS)).map((f) => f.label);
  assert.deepEqual(flags, ['Left-hand drive', 'Imported', 'Damp mentioned', '5 owners']);
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
  const cfg = { wantedSpecs: ['Habitation air conditioning', 'Self-levelling'], minWantedSpecs: 2, underpricedPercent: 10, staleDays: 60 };
  const today = '2026-10-11';
  assert.equal(scoreDeal({ specs: [{ label: 'Self-levelling' }], value: { pct: -12 } }, cfg, today).isDeal, true);
  assert.equal(scoreDeal({ specs: [{ label: 'Habitation air conditioning' }, { label: 'Self-levelling' }], value: null }, cfg, today).isDeal, true);
  assert.equal(scoreDeal({ specs: [{ label: 'Self-levelling' }], value: { pct: -5 } }, cfg, today).isDeal, false);
  const stale = scoreDeal({ listedDate: '2026-07-01', priceHistory: [{ date: '2026-07-01', price: 50000 }, { date: '2026-09-01', price: 47000 }], value: null }, cfg, today);
  assert.equal(stale.motivated, true);
  assert.equal(stale.daysListed, 102);
  assert.equal(stale.isDeal, true);
  assert.ok(stale.desperation > 40 && stale.desperation < 60, `desperation ${stale.desperation}`);
  const longListed = scoreDeal({ listedDate: '2026-03-01', priceHistory: [{ date: '2026-10-11', price: 50000 }], value: null, sellerType: 'PRIVATE' }, cfg, today);
  assert.equal(longListed.motivated, true, 'six months listed counts on its own');
  assert.equal(longListed.desperation, 60);
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
