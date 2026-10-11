// Spec matching, kit pricing and "is this underpriced?" scoring.

import { advertText } from './advert.js';

/**
 * Kit worth knowing about. Each entry is matched (case-insensitively) against
 * the advert's features list, description and specs. `value` is a rough
 * fitted cost in pounds, used to compare prices net of kit. Override or extend
 * with "specs" in search.config.json.
 */
export const DEFAULT_SPECS = [
  { label: 'Habitation air conditioning', value: 2200, pattern: 'truma aventa|dometic (freshjet|freshlight|fj\\d|harrier|b\\d{4})|roof[\\s-]?(mounted[\\s-]?)?air[\\s-]?con|habitation air[\\s-]?con|air[\\s-]?con(ditioning)? (unit )?(in|to|for) (the )?(habitation|living|rear|lounge|bedroom)|rear air[\\s-]?con|air[\\s-]?con(ditioning)? unit|(roof|habitation)[\\s-]?a\\/c' },
  { label: 'Cab air conditioning', value: 0, pattern: 'air[\\s-]?con(ditioning)?\\b|\\ba\\/c\\b|climate control' },
  { label: 'Self-levelling', value: 5500, pattern: 'self[\\s-]?levell?ing|levell?ing (system|jacks|legs)|hydraulic (jacks|levell?ing)|\\be\\s?&\\s?p\\b|e&amp;p' },
  { label: 'Rear air suspension', value: 2000, pattern: 'air[\\s-]?suspension|air[\\s-]?ride|\\bvb[\\s-]?air|goldschmitt|semi[\\s-]?air|dunlop air' },
  { label: '360° camera', value: 450, pattern: '\\b360\\s*(°|degree|deg\\b|cam)|surround[\\s-]?view|bird\'?s[\\s-]?eye' },
  { label: 'Reversing camera', value: 200, pattern: 'revers(e|ing)[\\s-]?cam|rear[\\s-]?(view[\\s-]?)?cam' },
  { label: 'Automatic', value: 1500, pattern: '^gearbox: auto|\\bautomatic gearbox\\b|\\bauto(matic)? trans|\\bdsg\\b|9[\\s-]?speed auto' },
  { label: 'Solar panel', value: 500, pattern: 'solar' },
  { label: 'Lithium battery', value: 1200, pattern: 'lithium|lifepo' },
  { label: 'Inverter', value: 300, pattern: 'inverter' },
  { label: 'Diesel heater', value: 0, pattern: 'diesel (heater|heating)|truma combi d|webasto|eberspa' },
  { label: 'Cruise control', value: 0, pattern: 'cruise' },
  { label: 'Tow bar', value: 500, pattern: 'tow[\\s-]?bar' },
  { label: 'Awning', value: 600, pattern: 'awning|wind[\\s-]?out canopy' },
  { label: 'Satellite TV', value: 800, pattern: 'sat(ellite)?[\\s-]?(dish|dome|system|tv)|oyster' },
  { label: 'Full service history', value: 0, pattern: 'full (service|main dealer|dealer) history|\\bfsh\\b|^service history: full' },
];

/** Things that should make you cautious. Matched the same way. */
export const DEFAULT_RED_FLAGS = [
  { label: 'Left-hand drive', pattern: 'left[\\s-]?hand[\\s-]?drive|\\blhd\\b|^driver position: left' },
  { label: 'Imported', pattern: '\\bimport(ed)?\\b' },
  { label: 'Damp mentioned', pattern: '\\bdamp\\b' },
  { label: 'Write-off category', pattern: '\\bcat(egory)?[\\s-]?(s|n|c|d)\\b' },
  { label: 'Spares or repair', pattern: 'spares or repair|non[\\s-]?runner' },
];

export function compileSpecs(specs = DEFAULT_SPECS) {
  return specs.map((s) => ({ label: s.label, value: s.value || 0, re: new RegExp(s.pattern, 'im') }));
}

function evidenceFor(text, m) {
  const start = Math.max(0, text.lastIndexOf('\n', m.index) + 1);
  const end = text.indexOf('\n', m.index);
  const line = text.slice(start, end === -1 ? undefined : end).trim();
  if (line.length <= 90) return line;
  const at = m.index - start;
  return '…' + line.slice(Math.max(0, at - 40), at + 50).trim() + '…';
}

/** Which of the specs an advert has, with a short piece of evidence for each. */
export function matchSpecs(details, compiled) {
  const text = advertText(details);
  const matched = [];
  for (const { label, value, re } of compiled) {
    const m = re.exec(text);
    if (m) matched.push({ label, value, evidence: evidenceFor(text, m) });
  }
  // A generic "air con" mention counts as cab air con only when nothing points at a habitation unit.
  const hab = matched.find((s) => s.label === 'Habitation air conditioning');
  const cab = matched.find((s) => s.label === 'Cab air conditioning');
  if (hab && cab && /^cab air/i.test(cab.evidence) === false && hab.evidence === cab.evidence) {
    matched.splice(matched.indexOf(cab), 1);
  }
  return matched;
}

export function matchRedFlags(details, compiledFlags) {
  const text = advertText(details);
  const flags = [];
  for (const { label, re } of compiledFlags) {
    const m = re.exec(text);
    if (m) flags.push({ label, evidence: evidenceFor(text, m) });
  }
  if (details.owners >= 4) flags.push({ label: `${details.owners} owners`, evidence: `${details.owners} previous owners` });
  if (details.historyCheck && !/^PASSED/.test(details.historyCheck)) flags.push({ label: 'History check', evidence: details.historyCheck });
  return flags;
}

/** Pounds of fitted kit an advert carries, by the values in the spec list. */
export function kitValue(advert) {
  return (advert.specs || []).reduce((sum, s) => sum + (s.value || 0), 0);
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function median(nums) {
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/**
 * Least-squares fit of y = a + b*age + c*miles over the comparables, with a
 * light ridge penalty so a handful of points cannot produce silly slopes.
 * Returns a predictor, or null if the fit is not trustworthy.
 */
function fitPrice(comps) {
  const n = comps.length;
  if (n < 8) return null;
  const mAge = comps.reduce((s, c) => s + c.age, 0) / n;
  const mMi = comps.reduce((s, c) => s + c.miles, 0) / n;
  const mY = comps.reduce((s, c) => s + c.y, 0) / n;
  let saa = 0, smm = 0, sam = 0, say = 0, smy = 0;
  for (const c of comps) {
    const a = c.age - mAge, m = c.miles - mMi, y = c.y - mY;
    saa += a * a; smm += m * m; sam += a * m; say += a * y; smy += m * y;
  }
  saa *= 1 + 1e-6; smm *= 1 + 1e-6; // tiny per-variable ridge so a flat predictor cannot blow up
  saa += 1e-9; smm += 1e-9;
  const det = saa * smm - sam * sam;
  if (Math.abs(det) < 1e-9) return null;
  let b = (say * smm - smy * sam) / det;
  let c = (smy * saa - say * sam) / det;
  // Sanity: prices should not rise with age or mileage. Clamp rather than trust noise.
  b = Math.min(0, Math.max(b, -0.15 * mY));        // at most 15% of mean price per year
  c = Math.min(0, Math.max(c, -0.5));             // at most 50p per mile
  return (age, miles) => mY + b * (age - mAge) + c * (miles - mMi);
}

function comparableKeys(a) {
  const d = a.details || {};
  const keys = [];
  if (a.make && a.model) keys.push({ basis: 'model', key: `model|${norm(a.make)}|${norm(a.model)}`, span: 2, min: 3 });
  if (d.chassis && d.keySpec?.Berth) keys.push({ basis: 'chassis', key: `chassis|${norm(d.chassis)}|${norm(d.bodyType)}|${d.keySpec.Berth}`, span: 2, min: 5 });
  if (a.make) keys.push({ basis: 'make', key: `make|${norm(a.make)}`, span: 1, min: 6 });
  return keys;
}

/**
 * Compare each live advert's price, net of kit, with similar live adverts.
 * Tiers: same make+model (year within 2); same chassis, body type and berth
 * (year within 2); same make (year within 1). With enough comparables the
 * expected price is adjusted for age and mileage, otherwise a median is used.
 * Returns id -> { pct, expected, comps, basis, adjusted } (pct < 0 = cheaper).
 */
export function compareWithSimilar(adverts, { minComparables = 3 } = {}) {
  const thisYear = new Date().getFullYear();
  const live = adverts.filter((a) => a.status === 'active' && !a.excluded && a.price != null && a.year != null);
  const groups = new Map();
  const point = (a) => ({ id: a.id, year: a.year, age: thisYear - a.year, miles: a.mileage ?? 30000, y: a.price - kitValue(a) });
  for (const a of live) {
    for (const k of comparableKeys(a)) {
      if (!groups.has(k.key)) groups.set(k.key, []);
      groups.get(k.key).push(point(a));
    }
  }

  const result = {};
  for (const a of live) {
    const me = point(a);
    for (const k of comparableKeys(a)) {
      const min = k.basis === 'model' ? minComparables : k.min;
      const comps = (groups.get(k.key) || []).filter((p) => p.id !== a.id && Math.abs(p.year - a.year) <= k.span);
      if (comps.length < min) continue;
      const predictor = fitPrice(comps);
      const expected = predictor ? predictor(me.age, me.miles) : median(comps.map((p) => p.y));
      if (!(expected > 1000)) continue;
      result[a.id] = {
        pct: Math.round(((me.y - expected) / expected) * 1000) / 10,
        expected: Math.round(expected),
        net: Math.round(me.y),
        comps: comps.length,
        basis: k.basis,
        adjusted: !!predictor,
      };
      break;
    }
  }
  return result;
}

/** Listing date encoded in Autotrader advert ids (YYYYMMDD + sequence). */
export function listedDateFromId(id, today = new Date()) {
  const m = /^(20\d{2})(\d{2})(\d{2})\d{5,}$/.exec(String(id));
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return null;
  if (d.getTime() > today.getTime() + 864e5 || m[1] < 2015) return null;
  return iso;
}

export function daysBetween(fromIso, toIso) {
  return Math.round((new Date(toIso + 'T00:00:00Z') - new Date(fromIso + 'T00:00:00Z')) / 864e5);
}

/** Price-drop summary from the recorded history. */
export function priceDrops(advert) {
  const h = advert.priceHistory || [];
  let drops = 0;
  for (let i = 1; i < h.length; i++) if (h[i].price < h[i - 1].price) drops++;
  const first = h[0]?.price ?? advert.price;
  const last = h.at(-1)?.price ?? advert.price;
  return { drops, totalDropPct: first ? Math.round(((last - first) / first) * 1000) / 10 : 0 };
}

/** Decide whether an advert is worth a look, per the "deals" config. */
export function scoreDeal(advert, dealConfig, today = new Date().toISOString().slice(0, 10)) {
  const wanted = new Set(dealConfig.wantedSpecs || []);
  const have = (advert.specs || []).map((s) => s.label);
  const wantedHits = have.filter((l) => wanted.has(l));
  const v = advert.value;
  const underpriced = !!v && v.pct <= -(dealConfig.underpricedPercent ?? 10);
  const highSpec = wantedHits.length >= (dealConfig.minWantedSpecs ?? 2);
  const listed = advert.listedDate || advert.firstSeen;
  const daysListed = listed ? daysBetween(listed, today) : null;
  const { drops, totalDropPct } = priceDrops(advert);
  const staleDays = dealConfig.staleDays ?? 60;
  const motivated = (daysListed != null && daysListed >= staleDays && drops >= 1) || drops >= 2;
  const redFlags = (advert.redFlags || []).length;
  return {
    underpriced,
    highSpec,
    motivated,
    wantedHits,
    daysListed,
    drops,
    totalDropPct,
    redFlags,
    isDeal: (underpriced || highSpec || motivated) && redFlags === 0,
  };
}

// ---------------------------------------------------------------------------
// Vehicle length. Autotrader's own length field is often empty, so we work it
// out from the advert: a stated figure, Autotrader's spec sheet, or the base
// vehicle and wheelbase code. Lengths in metres.

const SHORT_VANS = [
  // Anything built on these is well under 6 m.
  { re: /\b(transporter|t5|t6(\.1)?|t7|california|caddy|multivan|id\.? ?buzz|caravelle|shuttle)\b/i, m: 5.0, name: 'VW Transporter class' },
  { re: /\b(vito|viano|marco polo|v[\s-]?class|eqv)\b/i, m: 5.1, name: 'Mercedes Vito class' },
  { re: /\b(trafic|vivaro|talento|primastar|nv300|expert|dispatch|proace|scudo|jumpy|zafira life|spacetourer)\b/i, m: 5.3, name: 'Trafic/Vivaro class' },
  { re: /\b(transit custom|tourneo custom|nugget)\b/i, m: 5.3, name: 'Transit Custom' },
  { re: /\b(berlingo|rifter|combo|partner|doblo|kangoo|townstar|nv200|e-nv200|bipper|nemo|fiorino|hi[\s-]?ace|bongo|freeda|elgrand|serena|noah|voxy|alphard|vellfire|delica|stepwagon|step ?wgn)\b/i, m: 4.8, name: 'small van / MPV' },
];

// Base-vehicle length by wheelbase code. Keys are lower-case chassis names.
const WHEELBASE = {
  ducato: { l1: 4.96, l2: 5.41, l3: 5.99, l4: 6.36, swb: 4.96, mwb: 5.41, lwb: 5.99, xlwb: 6.36, elwb: 6.36, 'extra long': 6.36 },
  boxer: 'ducato', relay: 'ducato', jumper: 'ducato', movano: 'ducato', master: { swb: 5.05, mwb: 5.55, lwb: 6.2, elwb: 6.85, xlwb: 6.85, l1: 5.05, l2: 5.55, l3: 6.2, l4: 6.85 },
  transit: { l2: 5.53, l3: 5.98, l4: 6.7, mwb: 5.53, lwb: 5.98, jumbo: 6.7, elwb: 6.7, xlwb: 6.7, 'extra long': 6.7 },
  sprinter: { swb: 5.27, mwb: 5.93, lwb: 6.97, elwb: 7.37, xlwb: 7.37, l1: 5.27, l2: 5.93, l3: 6.97, l4: 7.37, 'extra long': 7.37 },
  crafter: { mwb: 5.99, lwb: 6.84, xlwb: 7.39, elwb: 7.39, l3: 5.99, l4: 6.84, l5: 7.39, 'extra long': 7.39 },
  tge: 'crafter',
  daily: { swb: 5.08, mwb: 6.0, lwb: 7.0, elwb: 7.5, xlwb: 7.5, l3: 6.0, l4: 7.0, l5: 7.5, 'extra long': 7.5 },
  iveco: 'daily',
};

function wheelbaseTable(name) {
  let t = WHEELBASE[name];
  while (typeof t === 'string') t = WHEELBASE[t];
  return t || null;
}

/**
 * Best estimate of the vehicle's overall length.
 * Returns { metres, source } or null if unknown.
 */
export function inferLength(advert) {
  const d = advert.details || {};
  const text = [advert.title, advert.subTitle, advert.attentionGrabber, advert.model, ...(d.features || []), d.description || ''].filter(Boolean).join('\n');
  const lower = text.toLowerCase();

  // 1. Autotrader's own spec sheet.
  for (const [k, v] of Object.entries(d.specs || {})) {
    if (/length/i.test(k)) {
      const n = parseFloat(String(v).replace(/,/g, ''));
      if (n > 1000 && n < 12000) return { metres: Math.round(n / 10) / 100, source: 'spec sheet' };
      if (n > 3 && n < 12) return { metres: Math.round(n * 100) / 100, source: 'spec sheet' };
    }
  }

  // 2. A stated length in the text ("length 6.36m", "6.99 metres long", "overall length: 7,400mm").
  const stated = [];
  const re = /(?:length|long)[^\n\d]{0,25}?(\d(?:[.,]\d{1,2})?)\s?(m\b|metres?|meters?|mtrs?)|(\d(?:[.,]\d{1,2})?)\s?(m\b|metres?|meters?|mtrs?)[^\n\d]{0,20}?(?:long|length|overall)|(?:length|long)[^\n\d]{0,25}?(\d{4})\s?mm|(\d{4})\s?mm[^\n\d]{0,20}?(?:long|length)/gi;
  let m;
  while ((m = re.exec(lower))) {
    const metres = m[1] || m[3] ? parseFloat((m[1] || m[3]).replace(',', '.')) : parseInt(m[5] || m[6], 10) / 1000;
    if (metres >= 4 && metres <= 12) stated.push(metres);
  }
  if (stated.length) return { metres: Math.round(stated[0] * 100) / 100, source: 'stated in advert' };

  // 3. Known short base vehicles.
  for (const s of SHORT_VANS) {
    if (s.re.test(text)) return { metres: s.m, source: s.name };
  }

  // 4. Base vehicle plus wheelbase code.
  const chassis = `${d.chassis || ''} ${advert.make || ''} ${advert.title || ''} ${advert.subTitle || ''}`.toLowerCase();
  for (const name of Object.keys(WHEELBASE)) {
    if (!new RegExp(`\\b${name}\\b`).test(chassis)) continue;
    const table = wheelbaseTable(name);
    if (!table) continue;
    const codes = Object.keys(table).sort((a, b) => b.length - a.length);
    for (const code of codes) {
      const codeRe = new RegExp(`\\b${code.replace(/\s/g, '[\\s-]?')}(\\b|h\\d)`, 'i');
      if (codeRe.test(lower)) return { metres: table[code], source: `${name} ${code.toUpperCase()}` };
    }
    break;
  }
  return null;
}

/** Apply a length rule. Returns an exclusion reason, or null to keep. */
export function lengthExclusion(advert, { minMetres, maxMetres, hideUnknown = false } = {}) {
  if (minMetres == null && maxMetres == null) return null;
  const len = advert.length;
  if (!len) return hideUnknown ? 'length unknown' : null;
  if (minMetres != null && len.metres < minMetres - 0.05) return `${len.metres} m (${len.source})`;
  if (maxMetres != null && len.metres > maxMetres + 0.05) return `${len.metres} m (${len.source})`;
  return null;
}
