import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileSpecs, matchSpecs, compareWithSimilar, scoreDeal, DEFAULT_SPECS } from '../src/spec.js';
import { parseAdvertHtml } from '../src/advert.js';

test('spec matching finds kit in features and description', () => {
  const details = {
    features: ['Cab air-con', 'Reversing camera', 'Wind Out Canopy'],
    description: 'Fitted with E&P self-levelling system and VB air suspension on the rear. 360 degree camera too.',
    keySpec: { Gearbox: 'Automatic' },
    specs: {},
  };
  const labels = matchSpecs(details, compileSpecs(DEFAULT_SPECS)).map((m) => m.label);
  for (const l of ['Air conditioning', 'Self-levelling', 'Rear air suspension', '360° camera', 'Reversing camera', 'Automatic', 'Awning']) {
    assert.ok(labels.includes(l), `expected ${l} in ${labels}`);
  }
  assert.ok(!labels.includes('Solar panel'));
});

test('comparison with similar adverts uses model tier then make tier', () => {
  const mk = (id, make, model, year, price) => ({ id, make, model, year, price, status: 'active' });
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
  assert.equal(r.a.median, 52000);
  assert.ok(r.a.pct < -20);
  assert.equal(r.e, undefined, 'no model comps and fewer than 6 make comps');
  assert.equal(r.x, undefined);
});

test('deal scoring', () => {
  const cfg = { wantedSpecs: ['Air conditioning', 'Self-levelling'], minWantedSpecs: 2, underpricedPercent: 10 };
  assert.equal(scoreDeal({ specs: [{ label: 'Air conditioning' }], value: { pct: -12 } }, cfg).isDeal, true);
  assert.equal(scoreDeal({ specs: [{ label: 'Air conditioning' }, { label: 'Self-levelling' }], value: null }, cfg).isDeal, true);
  assert.equal(scoreDeal({ specs: [{ label: 'Air conditioning' }], value: { pct: -5 } }, cfg).isDeal, false);
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
