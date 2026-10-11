// Spec matching and "is this underpriced?" scoring.

import { advertText } from './advert.js';

/**
 * Kit worth knowing about. Each entry is matched (case-insensitively) against
 * the advert's features list, description and specs. Add to or override this
 * list with "specs" in search.config.json.
 */
export const DEFAULT_SPECS = [
  { label: 'Air conditioning', pattern: 'air[\\s-]?con(ditioning)?\\b|\\ba\\/c\\b|climate control' },
  { label: 'Self-levelling', pattern: 'self[\\s-]?levell?ing|levell?ing (system|jacks|legs)|hydraulic (jacks|levell?ing)|\\be\\s?&\\s?p\\b' },
  { label: 'Rear air suspension', pattern: 'air[\\s-]?suspension|air[\\s-]?ride|\\bvb[\\s-]?air|goldschmitt|semi[\\s-]?air' },
  { label: '360° camera', pattern: '\\b360\\s*(°|degree|cam)|surround[\\s-]?view|bird\'?s[\\s-]?eye' },
  { label: 'Reversing camera', pattern: 'revers(e|ing)[\\s-]?cam|rear[\\s-]?(view[\\s-]?)?cam' },
  { label: 'Automatic', pattern: '^gearbox: auto|\\bautomatic gearbox\\b|\\bauto(matic)? trans' },
  { label: 'Solar panel', pattern: 'solar' },
  { label: 'Lithium battery', pattern: 'lithium' },
  { label: 'Inverter', pattern: 'inverter' },
  { label: 'Cruise control', pattern: 'cruise' },
  { label: 'Tow bar', pattern: 'tow[\\s-]?bar' },
  { label: 'Awning', pattern: 'awning|wind[\\s-]?out canopy' },
  { label: 'Satellite TV', pattern: 'sat(ellite)?[\\s-]?(dish|dome|system|tv)|oyster' },
  { label: 'Full service history', pattern: 'full (service|main dealer) history|\\bfsh\\b|^service history: full' },
];

export function compileSpecs(specs = DEFAULT_SPECS) {
  return specs.map((s) => ({ label: s.label, re: new RegExp(s.pattern, 'im') }));
}

/** Which of the specs an advert has, with a short piece of evidence for each. */
export function matchSpecs(details, compiled) {
  const text = advertText(details);
  const matched = [];
  for (const { label, re } of compiled) {
    const m = re.exec(text);
    if (!m) continue;
    const start = Math.max(0, text.lastIndexOf('\n', m.index) + 1);
    const end = text.indexOf('\n', m.index);
    const line = text.slice(start, end === -1 ? undefined : end).trim();
    matched.push({ label, evidence: line.length > 90 ? line.slice(Math.max(0, m.index - start - 40), m.index - start + 50).trim() + '…' : line });
  }
  return matched;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function median(nums) {
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/**
 * Compare each live advert's price with similar live adverts.
 * Tier 1: same make and model, year within 2. Tier 2: same make, year within 1.
 * Returns a map id -> { pct, median, comps, basis } (pct negative = cheaper).
 */
export function compareWithSimilar(adverts, { minComparables = 3, minLooseComparables = 6 } = {}) {
  const live = adverts.filter((a) => a.status === 'active' && a.price != null && a.year != null);
  const byModel = new Map();
  const byMake = new Map();
  for (const a of live) {
    const mk = norm(a.make);
    const md = norm(a.model);
    if (!mk) continue;
    if (md) {
      const key = `${mk}|${md}`;
      if (!byModel.has(key)) byModel.set(key, []);
      byModel.get(key).push(a);
    }
    if (!byMake.has(mk)) byMake.set(mk, []);
    byMake.get(mk).push(a);
  }

  const result = {};
  for (const a of live) {
    const tiers = [
      { pool: byModel.get(`${norm(a.make)}|${norm(a.model)}`) || [], span: 2, min: minComparables, basis: 'model' },
      { pool: byMake.get(norm(a.make)) || [], span: 1, min: minLooseComparables, basis: 'make' },
    ];
    for (const t of tiers) {
      const comps = t.pool.filter((b) => b.id !== a.id && Math.abs(b.year - a.year) <= t.span).map((b) => b.price);
      if (comps.length < t.min) continue;
      const med = median(comps);
      result[a.id] = { pct: Math.round(((a.price - med) / med) * 1000) / 10, median: Math.round(med), comps: comps.length, basis: t.basis };
      break;
    }
  }
  return result;
}

/** Decide whether an advert is worth a look, per the "deals" config. */
export function scoreDeal(advert, dealConfig) {
  const wanted = new Set(dealConfig.wantedSpecs || []);
  const have = (advert.specs || []).map((s) => s.label);
  const wantedHits = have.filter((l) => wanted.has(l));
  const v = advert.value;
  const underpriced = !!v && v.pct <= -(dealConfig.underpricedPercent ?? 10);
  const highSpec = wantedHits.length >= (dealConfig.minWantedSpecs ?? 2);
  return { underpriced, highSpec, wantedHits, isDeal: underpriced || highSpec };
}
