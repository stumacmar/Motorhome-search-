// Autotrader UK motorhome search client.
//
// The search results page is a client-side app that loads its listings from a
// GraphQL gateway. Reading that JSON directly is far more stable than scraping
// the rendered HTML. If the direct call is blocked (bot protection), we fall
// back to loading the real page in a headless browser and issuing the same
// request from inside it.

import { randomUUID } from 'node:crypto';

export const SEARCH_BASE = 'https://www.autotrader.co.uk/motorhome-search';
const GATEWAY = 'https://www.autotrader.co.uk/at-gateway?opname=SearchResultsListingsGridQuery';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// Only the fields we use. Fewer fields means fewer things that can break
// when Autotrader changes its schema.
const LISTINGS_QUERY = `
query SearchResultsListingsGridQuery($filters: [FilterInput!]!, $channel: Channel!, $page: Int, $sortBy: SearchResultsSort, $listingType: [ListingType!], $searchId: String!, $featureFlags: [FeatureFlag]) {
  searchResults(
    input: {facets: [], filters: $filters, channel: $channel, page: $page, sortBy: $sortBy, listingType: $listingType, searchId: $searchId, featureFlags: $featureFlags}
  ) {
    listings {
      ... on SearchListing {
        type
        advertId
        title
        subTitle
        attentionGrabber
        price
        vehicleLocation
        images
        numberOfImages
        sellerType
        fpaLink
        badges { type displayText }
        trackingContext {
          advertContext { make model vehicleCategory year condition price }
          distance { distance }
        }
      }
    }
    page {
      number
      count
      results { count }
    }
  }
}`;

// Maps the query-string parameters Autotrader uses in its search URLs to the
// filter names its gateway expects. Captured from the live site.
const URL_PARAM_TO_FILTER = {
  'postcode': 'postcode',
  'radius': 'distance',
  'make': 'make',
  'model': 'model',
  'year-from': 'min_year_manufactured',
  'year-to': 'max_year_manufactured',
  'price-from': 'min_price',
  'price-to': 'max_price',
  'minimum-mileage': 'min_mileage',
  'maximum-mileage': 'max_mileage',
  'fuel-type': 'fuel_type',
  'transmission': 'transmission',
  'seller-type': 'seller_type',
  'keywords': 'keywords',
  'berth': 'berth',
  'body-type': 'body_type',
  'bedroom-layout': 'bedroom_layout',
  'end-layout': 'end_layout',
  'driver-position': 'driver_position',
  'min-engine-size': 'min_engine_size',
  'max-engine-size': 'max_engine_size',
  'min-seats': 'min_seats',
  'max-seats': 'max_seats',
  'exterior-length-from': 'min_exterior_length',
  'exterior-length-to': 'max_exterior_length',
};

// Maps the friendlier keys used in search.config.json to gateway filter names.
const CRITERIA_TO_FILTER = {
  postcode: 'postcode',
  radius: 'distance',
  make: 'make',
  model: 'model',
  yearFrom: 'min_year_manufactured',
  yearTo: 'max_year_manufactured',
  priceFrom: 'min_price',
  priceTo: 'max_price',
  minMileage: 'min_mileage',
  maxMileage: 'max_mileage',
  fuel: 'fuel_type',
  transmission: 'transmission',
  sellerType: 'seller_type',
  keywords: 'keywords',
  berth: 'berth',
  bodyType: 'body_type',
  bedroomLayout: 'bedroom_layout',
  endLayout: 'end_layout',
  driverPosition: 'driver_position',
  minEngineSize: 'min_engine_size',
  maxEngineSize: 'max_engine_size',
  minSeats: 'min_seats',
  maxSeats: 'max_seats',
  minLength: 'min_exterior_length',
  maxLength: 'max_exterior_length',
};

const SORT_MAP = {
  datedesc: 'most_recent',
  relevance: 'relevance',
  'price-asc': 'price_asc',
  'price-desc': 'price_desc',
  distance: 'distance',
  mileage: 'mileage',
  'year-desc': 'year_dsc',
  'year-asc': 'year_asc',
};

function normalisePostcode(value) {
  return String(value).replace(/\s+/g, '').toUpperCase();
}

function addFilter(filters, name, value) {
  if (value === undefined || value === null || value === '') return;
  const values = Array.isArray(value) ? value : [value];
  const existing = filters.find((f) => f.filter === name);
  const selected = values.map((v) => (name === 'postcode' ? normalisePostcode(v) : String(v)));
  if (existing) existing.selected.push(...selected);
  else filters.push({ filter: name, selected });
}

function finalise(filters) {
  if (!filters.some((f) => f.filter === 'price_search_type')) {
    filters.push({ filter: 'price_search_type', selected: ['total'] });
  }
  filters.sort((a, b) => a.filter.localeCompare(b.filter));
  return filters;
}

/** Turn a pasted Autotrader motorhome search URL into gateway filters. */
export function filtersFromUrl(url) {
  const u = new URL(url);
  if (!u.pathname.includes('motorhome-search')) {
    throw new Error(`Expected a motorhome-search URL, got ${u.pathname}`);
  }
  const filters = [];
  let sortBy = 'most_recent';
  for (const [key, value] of u.searchParams.entries()) {
    if (key === 'sort') {
      sortBy = SORT_MAP[value] || 'most_recent';
    } else if (key === 'exclude-writeoff-categories') {
      if (value === 'on') addFilter(filters, 'is_writeoff', 'exclude');
    } else if (key === 'only-writeoff-categories') {
      if (value === 'on') addFilter(filters, 'is_writeoff', 'only');
    } else if (URL_PARAM_TO_FILTER[key]) {
      addFilter(filters, URL_PARAM_TO_FILTER[key], value);
    } else if (!['page', 'advertising-location', 'searchId', 'refresh'].includes(key)) {
      console.warn(`  (ignoring unknown URL parameter "${key}")`);
    }
  }
  return { filters: finalise(filters), sortBy };
}

/** Turn the structured "criteria" block from search.config.json into gateway filters. */
export function filtersFromCriteria(criteria) {
  const filters = [];
  for (const [key, value] of Object.entries(criteria)) {
    if (key === 'excludeWriteOffs') {
      if (value) addFilter(filters, 'is_writeoff', 'exclude');
    } else if (key === 'sort') {
      // handled below
    } else if (CRITERIA_TO_FILTER[key]) {
      addFilter(filters, CRITERIA_TO_FILTER[key], value);
    } else {
      throw new Error(`Unknown criteria key "${key}". See README for the supported keys.`);
    }
  }
  return { filters: finalise(filters), sortBy: SORT_MAP[criteria.sort] || 'most_recent' };
}

/** Build a human-clickable Autotrader URL for a set of gateway filters. */
export function urlFromFilters(filters, sortBy = 'most_recent') {
  const params = new URLSearchParams();
  const reverse = Object.fromEntries(Object.entries(URL_PARAM_TO_FILTER).map(([k, v]) => [v, k]));
  for (const f of filters) {
    if (f.filter === 'price_search_type') continue;
    if (f.filter === 'is_writeoff') {
      params.set(f.selected[0] === 'only' ? 'only-writeoff-categories' : 'exclude-writeoff-categories', 'on');
      continue;
    }
    const key = reverse[f.filter];
    if (!key) continue;
    for (const v of f.selected) params.append(key, v);
  }
  const sortKey = Object.entries(SORT_MAP).find(([, v]) => v === sortBy)?.[0];
  if (sortKey && sortKey !== 'relevance') params.set('sort', sortKey);
  return `${SEARCH_BASE}?${params.toString()}`;
}

function parseMoney(text) {
  if (!text) return null;
  const n = Number(String(text).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function parseMiles(text) {
  if (!text) return null;
  const m = String(text).match(/([\d,]+)\s*miles?/i);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

/** Reduce a raw gateway listing to the fields we store. */
export function normaliseListing(raw) {
  const ctx = raw.trackingContext?.advertContext || {};
  const badge = (type) => raw.badges?.find((b) => b.type === type)?.displayText || null;
  const image = raw.images?.[0] ? raw.images[0].replace('{resize}', 'w480h360') : null;
  const fpaPath = raw.fpaLink ? raw.fpaLink.split('?')[0] : `/motorhome-details/${raw.advertId}`;
  return {
    id: String(raw.advertId),
    title: raw.title || [ctx.make, ctx.model].filter(Boolean).join(' '),
    subTitle: raw.subTitle || null,
    attentionGrabber: raw.attentionGrabber || null,
    make: ctx.make || null,
    model: ctx.model || null,
    category: ctx.vehicleCategory || null,
    year: ctx.year ?? null,
    registeredYear: badge('REGISTERED_YEAR'),
    mileageText: badge('MILEAGE'),
    mileage: parseMiles(badge('MILEAGE')),
    price: ctx.price ?? parseMoney(raw.price),
    priceText: raw.price || null,
    location: raw.vehicleLocation || null,
    distanceMiles: raw.trackingContext?.distance?.distance ?? null,
    sellerType: raw.sellerType || null,
    condition: ctx.condition || null,
    image,
    imageCount: raw.numberOfImages ?? (raw.images?.length || 0),
    url: `https://www.autotrader.co.uk${fpaPath}`,
  };
}

const LISTING_TYPES = new Set(['NATURAL_LISTING', 'PROMOTED_LISTING', 'FEATURED_LISTING']);

function extractPage(json) {
  const body = Array.isArray(json) ? json[0] : json;
  if (body?.errors?.length) {
    throw new Error(`Gateway error: ${body.errors.map((e) => e.message).join('; ')}`);
  }
  const sr = body?.data?.searchResults;
  if (!sr || !Array.isArray(sr.listings)) {
    throw new Error('Gateway response had no searchResults.listings (page structure changed?)');
  }
  const unknown = new Set();
  const listings = [];
  for (const l of sr.listings) {
    if (!l?.advertId) continue;
    if (!LISTING_TYPES.has(l.type)) {
      if (l.type !== 'GPT_LISTING') unknown.add(l.type);
      continue;
    }
    listings.push(normaliseListing(l));
  }
  if (unknown.size) console.warn(`  (skipped unknown listing types: ${[...unknown].join(', ')})`);
  return {
    listings,
    pageCount: sr.page?.count ?? 1,
    totalResults: sr.page?.results?.count ?? listings.length,
  };
}

function gatewayBody(filters, sortBy, page, searchId) {
  return JSON.stringify([
    {
      operationName: 'SearchResultsListingsGridQuery',
      variables: {
        filters,
        channel: 'motorhomes',
        page,
        sortBy,
        listingType: null,
        searchId,
        featureFlags: ['USE_MULTI_CATEGORY_SEARCH'],
      },
      query: LISTINGS_QUERY,
    },
  ]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Direct HTTP transport: plain fetch to the gateway. */
export async function fetchPageDirect(filters, sortBy, page, searchId) {
  const res = await fetch(GATEWAY, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: '*/*',
      'accept-language': 'en-GB',
      referer: 'https://www.autotrader.co.uk/',
      'user-agent': USER_AGENT,
      'x-sauron-app-name': 'sauron-search-results-app',
    },
    body: gatewayBody(filters, sortBy, page, searchId),
  });
  if (!res.ok) throw new Error(`Gateway HTTP ${res.status}`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Gateway returned non-JSON (${text.slice(0, 80).replace(/\s+/g, ' ')}...)`);
  }
  return extractPage(json);
}

/**
 * Browser transport: load the real search page so cookies and bot checks are
 * satisfied, then issue the gateway request from inside the page.
 */
export class BrowserTransport {
  async start() {
    const { chromium } = await import('playwright');
    this.browser = await chromium.launch({ headless: true });
    const context = await this.browser.newContext({
      userAgent: USER_AGENT,
      locale: 'en-GB',
      viewport: { width: 1280, height: 900 },
    });
    this.page = await context.newPage();
    await this.page.goto(`${SEARCH_BASE}?postcode=SW1A1AA`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForTimeout(3000);
  }

  async fetchPage(filters, sortBy, page, searchId) {
    const body = gatewayBody(filters, sortBy, page, searchId);
    const result = await this.page.evaluate(
      async ({ url, body }) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: '*/*',
            'x-sauron-app-name': 'sauron-search-results-app',
          },
          body,
        });
        return { status: res.status, text: await res.text() };
      },
      { url: GATEWAY, body },
    );
    if (result.status !== 200) throw new Error(`Gateway HTTP ${result.status} (browser)`);
    return extractPage(JSON.parse(result.text));
  }

  async stop() {
    await this.browser?.close();
  }
}

/**
 * Fetch every page of a search (up to maxPages). Tries the direct transport
 * first and switches to the browser transport if that is blocked.
 */
export async function fetchSearch({ filters, sortBy = 'most_recent' }, { maxPages = 10, transport = null, log = console } = {}) {
  const searchId = randomUUID();
  const all = new Map();
  let totalResults = 0;
  let pageCount = 1;
  let usedBrowser = false;

  for (let page = 1; page <= Math.min(pageCount, maxPages); page++) {
    let result;
    try {
      result = transport?.browser
        ? await transport.browser.fetchPage(filters, sortBy, page, searchId)
        : await fetchPageDirect(filters, sortBy, page, searchId);
    } catch (err) {
      if (transport?.browser) throw err;
      log.warn(`  direct request failed (${err.message}); retrying through a headless browser`);
      transport = transport || {};
      transport.browser = new BrowserTransport();
      await transport.browser.start();
      usedBrowser = true;
      result = await transport.browser.fetchPage(filters, sortBy, page, searchId);
    }
    pageCount = result.pageCount;
    totalResults = result.totalResults;
    for (const l of result.listings) all.set(l.id, l);
    log.info(`  page ${page}/${Math.min(pageCount, maxPages)}: ${result.listings.length} adverts (${totalResults} total)`);
    if (page < Math.min(pageCount, maxPages)) await sleep(1500 + Math.random() * 1500);
  }

  return {
    listings: [...all.values()],
    totalResults,
    truncated: pageCount > maxPages,
    usedBrowser,
    transport,
  };
}
