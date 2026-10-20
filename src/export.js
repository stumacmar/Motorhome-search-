// A slim copy of the store for the dashboard: every advert, but only the
// fields the page shows. The full store stays in listings.json so the job
// does not refetch advert pages it has already read.

export const DASHBOARD_PATH = 'docs/data/dashboard.json';
export const DETAILS_PATH = 'docs/data/dashboard-details.json'; // descriptions and evidence, loaded by the page after first paint

const DESCRIPTION_CHARS = 1200;
const HIDDEN_DESCRIPTION_CHARS = 200; // adverts hidden by the rules get a shorter blurb to keep the file small
const labelsOnly = (list, keep = []) => (list || []).map((s) => Object.fromEntries(['label', ...keep].filter((k) => s[k] !== undefined).map((k) => [k, s[k]])));
const evidence = (list) => Object.fromEntries((list || []).filter((s) => s.evidence).map((s) => [s.label, s.evidence]));

/** The deal fields the dashboard and notifications read; the rest stays in listings.json. */
function slimDeal(deal) {
  if (!deal) return deal;
  const { pickScore, pickParts, underpriced, highSpec, motivated, desperation, motivationReasons, starCount, starOf, niceHits, kitScore, staleNoCut, listedReliable, drops, totalDropPct, isDeal } = deal;
  return { pickScore, pickParts, underpriced, highSpec, motivated, desperation, motivationReasons, starCount, starOf, niceHits, kitScore, staleNoCut, listedReliable, drops, totalDropPct, isDeal };
}

export function slimAdvert(a) {
  const d = a.details;
  const brief = a.excluded || a.status !== 'active';
  return {
    id: a.id,
    title: a.title,
    subTitle: a.subTitle,
    make: a.make,
    model: a.model,
    year: a.year,
    registeredYear: a.registeredYear,
    mileage: a.mileage,
    mileageText: a.mileageText,
    price: a.price,
    location: a.location,
    distanceMiles: a.distanceMiles,
    sellerType: a.sellerType,
    image: a.image,
    url: a.url,
    firstSeen: a.firstSeen,
    lastSeen: a.lastSeen,
    listedDate: a.listedDate,
    status: a.status,
    goneSince: a.goneSince,
    searches: a.searches,
    priceHistory: a.priceHistory,
    specs: labelsOnly(a.specs, ['value']),
    redFlags: labelsOnly(a.redFlags),
    signals: labelsOnly(a.signals),
    fit: a.fit,
    newStock: a.newStock,
    market: a.market,
    soldRef: a.soldRef,
    relisted: a.relisted,
    value: a.value,
    deal: slimDeal(a.deal),
    length: a.length,
    lengthOutside: a.lengthOutside,
    excluded: a.excluded,
    detailsError: a.detailsError ? { message: a.detailsError.message } : undefined,
    details: d
      ? {
          chassis: d.chassis,
          bodyType: d.bodyType,
          owners: d.owners,
          serviceHistory: d.serviceHistory,
          historyCheck: d.historyCheck,
          keySpec: { Berth: d.keySpec?.Berth, Gearbox: d.keySpec?.Gearbox },
          descriptionLength: d.descriptionLength,
        }
      : undefined,
  };
}

/** The heavier text per live advert: description and the evidence behind each chip. Keyed by advert id. */
export function detailsFor(a) {
  const d = a.details;
  if (!d || a.status !== 'active') return null;
  return {
    description: Array.from(d.description || '').slice(0, a.excluded ? HIDDEN_DESCRIPTION_CHARS : DESCRIPTION_CHARS).join(''),
    specs: evidence(a.specs),
    signals: evidence(a.signals),
    redFlags: evidence(a.redFlags),
  };
}

export function detailsStore(store) {
  const out = {};
  for (const [id, a] of Object.entries(store.adverts)) {
    const d = detailsFor(a);
    if (d) out[id] = d;
  }
  return out;
}

export function slimStore(store) {
  const adverts = {};
  for (const [id, a] of Object.entries(store.adverts)) {
    // Adverts hidden by the length or berth rule go too, so the dashboard can show them under "Hidden by rules".
    adverts[id] = slimAdvert(a);
  }
  return {
    version: store.version,
    generatedAt: store.generatedAt,
    wantedSpecs: store.wantedSpecs,
    minWantedSpecs: store.minWantedSpecs,
    niceToHave: store.niceToHave,
    topPickScore: store.topPickScore,
    lengthRule: store.lengthRule,
    sellDays: store.sellDays,
    searches: store.searches,
    runs: (store.runs || []).slice(0, 14),
    hiddenByRules: Object.values(store.adverts).filter((a) => a.status === 'active' && a.excluded).length,
    adverts,
  };
}
