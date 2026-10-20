// Fetch one advert's detail page and extract the data the search results
// do not carry: the seller's description, the features list, owners, service
// history and the history check. The page is server-rendered with the advert
// embedded as JSON in window.__staticRouterHydrationData.

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 30_000;
export const DESCRIPTION_MAX = 6000; // characters of description kept; long dealer blurbs list kit near the end

export function advertUrl(id) {
  return `https://www.autotrader.co.uk/motorhome-details/${id}`;
}

/** Pull the hydration JSON out of the page HTML. */
export function parseAdvertHtml(html) {
  const m = html.match(/window\.__staticRouterHydrationData = JSON\.parse\("((?:[^"\\]|\\.)*)"\)/);
  if (!m) {
    if (/just a moment|attention required/i.test(html)) throw new Error('Cloudflare challenge page');
    throw new Error('advert page had no embedded data (page structure changed?)');
  }
  const data = JSON.parse(JSON.parse(`"${m[1]}"`));
  const advert = data?.loaderData?.['motorhome-details']?.aggregatorAdvert;
  if (!advert) throw new Error('advert data missing from page (removed advert?)');
  return summariseAdvert(advert);
}

const str = (v) => (v == null ? null : String(v));

/** Reduce the (very large) advert object to what we store. */
export function summariseAdvert(a) {
  const features = [];
  for (const group of a.featuresWithDisclaimer?.features || []) {
    for (const item of group.items || []) if (item?.name) features.push(item.name.trim());
  }
  const keySpec = {};
  for (const k of a.keySpecification || []) if (k?.label) keySpec[k.label] = str(k.value);
  const specs = {};
  for (const group of a.specs || []) for (const item of group.items || []) if (item?.name) specs[item.name] = str(item.value);

  const description = (a.description?.text || []).join('\n').replace(/\s+\n/g, '\n').trim();
  const check = a.history?.vehicleCheck;
  const service = a.history?.serviceHistory;

  return {
    fetchedAt: new Date().toISOString().slice(0, 10),
    description: Array.from(description).slice(0, DESCRIPTION_MAX).join(''), // Array.from keeps emoji pairs whole
    descriptionLength: description.length,
    features: [...new Set(features)],
    keySpec,
    specs,
    chassis: [specs['Chassis make'], specs['Chassis model']].filter(Boolean).join(' ') || null,
    bodyType: specs['Body type'] || null,
    owners: a.history?.ownersData?.value != null ? Number(a.history.ownersData.value) || null : null,
    serviceHistory: service?.description || null,
    serviceHistoryType: service?.historyType || null,
    historyCheck: check ? `${check.status}${check.statusText ? ` (${check.statusText})` : ''}` : null,
    marketPriceRating: a.details?.pricing?.marketPriceRating?.value || null,
    imported: a.details?.vehicle?.imported === 'True',
    // Everything the matcher searches, in one lower-cased blob.
    _text: null,
  };
}

/** Text used for keyword matching: features, description and key specs. */
export function advertText(details) {
  return [
    ...(details.features || []),
    details.description || '',
    ...Object.entries(details.keySpec || {}).map(([k, v]) => `${k}: ${v}`),
    ...Object.entries(details.specs || {}).map(([k, v]) => `${k}: ${v}`),
  ]
    .join('\n')
    .toLowerCase();
}

export async function fetchAdvertDirect(id) {
  const res = await fetch(advertUrl(id), {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html', 'accept-language': 'en-GB' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: 'follow',
  });
  const html = await res.text();
  if (res.status === 404 || res.status === 410) return { gone: true };
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${html.slice(0, 80).replace(/\s+/g, ' ')}`);
  return parseAdvertHtml(html);
}

/** Same thing through the headless browser (see BrowserTransport in autotrader.js). */
export async function fetchAdvertViaBrowser(browserTransport, id) {
  const page = browserTransport.page;
  const res = await page.goto(advertUrl(id), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (res && [404, 410].includes(res.status())) return { gone: true };
  const html = await page.content();
  return parseAdvertHtml(html);
}
