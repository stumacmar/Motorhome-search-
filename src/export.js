// A slim copy of the store for the dashboard: every advert, but only the
// fields the page shows. The full store stays in listings.json so the job
// does not refetch advert pages it has already read.

export const DASHBOARD_PATH = 'docs/data/dashboard.json';

const DESCRIPTION_CHARS = 700;
const HIDDEN_DESCRIPTION_CHARS = 200; // adverts hidden by the rules get a shorter blurb to keep the file small

export function slimAdvert(a) {
  const d = a.details;
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
    specs: a.specs,
    redFlags: a.redFlags,
    value: a.value,
    deal: a.deal,
    length: a.length,
    excluded: a.excluded,
    detailsError: a.detailsError ? { message: a.detailsError.message } : undefined,
    details: d
      ? {
          chassis: d.chassis,
          bodyType: d.bodyType,
          owners: d.owners,
          serviceHistory: d.serviceHistory,
          historyCheck: d.historyCheck,
          keySpec: { Berth: d.keySpec?.Berth, Gearbox: d.keySpec?.Gearbox, 'End layout': d.keySpec?.['End layout'], 'Bedroom layout': d.keySpec?.['Bedroom layout'] },
          description: Array.from(d.description || '').slice(0, a.excluded ? HIDDEN_DESCRIPTION_CHARS : DESCRIPTION_CHARS).join(''),
          descriptionLength: d.descriptionLength,
        }
      : undefined,
  };
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
    searches: store.searches,
    runs: (store.runs || []).slice(0, 14),
    hiddenByRules: Object.values(store.adverts).filter((a) => a.status === 'active' && a.excluded).length,
    adverts,
  };
}
