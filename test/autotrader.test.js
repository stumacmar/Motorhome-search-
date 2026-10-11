import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtersFromUrl, filtersFromCriteria, urlFromFilters, normaliseListing } from '../src/autotrader.js';

const byName = (filters) => Object.fromEntries(filters.map((f) => [f.filter, f.selected]));

test('URL parameters map to gateway filters', () => {
  const { filters, sortBy } = filtersFromUrl(
    'https://www.autotrader.co.uk/motorhome-search?postcode=sw1a%201aa&radius=100&make=Auto-Sleepers&model=Nuevo&year-from=2015&price-to=40000&maximum-mileage=50000&berth=2&exclude-writeoff-categories=on&sort=datedesc',
  );
  assert.deepEqual(byName(filters), {
    postcode: ['SW1A1AA'], distance: ['100'], make: ['Auto-Sleepers'], model: ['Nuevo'],
    min_year_manufactured: ['2015'], max_price: ['40000'], max_mileage: ['50000'], berth: ['2'],
    is_writeoff: ['exclude'], price_search_type: ['total'],
  });
  assert.equal(sortBy, 'most_recent');
});

test('criteria map to gateway filters and back to a URL', () => {
  const spec = filtersFromCriteria({ postcode: 'SW1A 1AA', radius: 50, make: 'Adria', yearFrom: 2018, priceTo: 60000, excludeWriteOffs: true, sort: 'price-asc' });
  assert.equal(spec.sortBy, 'price_asc');
  const url = urlFromFilters(spec.filters, spec.sortBy);
  const back = filtersFromUrl(url);
  assert.deepEqual(byName(back.filters), byName(spec.filters));
  assert.equal(back.sortBy, 'price_asc');
});

test('unknown criteria key is an error', () => {
  assert.throws(() => filtersFromCriteria({ colour: 'white' }), /Unknown criteria key/);
});

test('listing is normalised', () => {
  const l = normaliseListing({
    type: 'NATURAL_LISTING', advertId: '2026', title: 'Roller Team Zefiro 675', subTitle: 'Low profile', price: '£33,990',
    vehicleLocation: 'Bradford (173 miles)', images: ['https://m.atcdn.co.uk/a/media/{resize}/abc.jpg'], numberOfImages: 3,
    sellerType: 'TRADE', fpaLink: '/motorhome-details/2026?sort=datedesc&searchId=x',
    badges: [{ type: 'MILEAGE', displayText: '58,000 miles' }, { type: 'REGISTERED_YEAR', displayText: '2017 (17 reg)' }],
    trackingContext: { advertContext: { make: 'Roller Team', model: 'Zefiro 675', vehicleCategory: 'motorhome', year: 2017, condition: 'used', price: 33990 }, distance: { distance: 173 } },
  });
  assert.equal(l.id, '2026');
  assert.equal(l.price, 33990);
  assert.equal(l.mileage, 58000);
  assert.equal(l.year, 2017);
  assert.equal(l.url, 'https://www.autotrader.co.uk/motorhome-details/2026');
  assert.equal(l.image, 'https://m.atcdn.co.uk/a/media/w480h360/abc.jpg');
  assert.equal(l.distanceMiles, 173);
});
