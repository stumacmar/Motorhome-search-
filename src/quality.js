// Quality rating: how well made and well regarded a motorhome is, 0 to 100,
// independent of its price. Built from public evidence, 2020 to 2026:
//
//   owner satisfaction  up to 45  Practical Motorhome / Camping and Caravanning
//                                 Club Owner Satisfaction Awards (owner surveys of
//                                 reliability, build, dealer and warranty)
//   build tier          up to 30  expert standing of the brand (premium, upper-mid,
//                                 small specialist converter, volume, value, budget sub-brand)
//   model awards        up to 15  Practical Motorhome Awards and European Innovation
//                                 Awards won or commended by this model line
//   base vehicle        up to 10  owner satisfaction with the chassis (VW, Mercedes,
//                                 Ford, Fiat ...)
//
// minus small penalties for known brand-wide problems. Quality for money then sets
// that score against the price, compared with vans of the same age and body type:
// 50 is what the money normally buys, higher is more quality for the price.
//
// Sources are listed in README.md. Award "years" are the award's own label, which
// is announced the winter before (the 2025 awards were announced in early 2025
// for vans on sale in 2024-25).

// Owner Satisfaction Awards: [new, pre-owned] scores in %, by award year. 2021 was
// not held and 2026 was postponed, so the years are 2020, 2022, 2023, 2024, 2025.
// null = not scored that year (too few owners).
const OSA = {
  hymer: { 2020: [80.6, 82.9], 2022: [84.4, 90.1], 2023: [82.1, 84.4], 2024: [80.3, 84.8], 2025: [null, 83.9] },
  burstner: { 2020: [81.9, 84.3], 2022: [87.4, null], 2023: [79.7, 85.0], 2024: [79.5, 82.8], 2025: [83.3, 82.4] },
  carthago: { 2020: [81.8, null], 2023: [83.4, null], 2024: [75.4, 84.2], 2025: [78.5, null] },
  dethleffs: { 2020: [83.9, null], 2023: [77.1, 85.0], 2024: [73.5, 83.8] },
  adria: { 2020: [79.8, null], 2022: [90.9, null], 2023: [83.7, 80.9], 2024: [76.2, 80.7], 2025: [83.8, 76.4] },
  rollerteam: { 2020: [80.0, 80.3], 2022: [84.9, 87.0], 2023: [80.9, 81.8], 2024: [79.8, 79.1], 2025: [83.7, 80.7] },
  rapido: { 2023: [81.8, 79.2], 2024: [null, 81.2], 2025: [null, 84.0] },
  benimar: { 2020: [76.3, null], 2023: [78.7, 79.9], 2024: [77.0, 80.1], 2025: [77.8, 82.8] },
  rimor: { 2020: [78.8, null], 2024: [79.5, null] },
  pilote: { 2024: [74.9, 78.0], 2025: [79.1, null] },
  chausson: { 2020: [73.3, 70.9], 2022: [79.7, null], 2023: [74.5, 75.3], 2024: [76.4, 78.5], 2025: [68.3, 76.0] },
  autosleepers: { 2020: [70.3, 76.3], 2022: [82.4, 86.9], 2023: [74.4, 81.1], 2024: [74.0, 79.2], 2025: [72.8, 78.7] },
  bailey: { 2020: [68.6, 70.0], 2022: [80.7, 88.0], 2023: [73.6, 82.6], 2024: [69.8, 80.6], 2025: [71.3, 80.8] },
  swift: { 2020: [66.6, 75.3], 2022: [74.7, 84.6], 2023: [73.1, 80.1], 2024: [74.8, 78.8], 2025: [75.8, 77.6] },
  autotrail: { 2020: [66.6, 74.7], 2022: [82.7, 86.3], 2023: [74.3, 79.2], 2024: [71.8, 78.1], 2025: [74.6, 76.7] },
  elddis: { 2020: [65.9, 74.4], 2022: [77.8, 78.6], 2023: [74.4, 76.0], 2024: [72.2, 75.8], 2025: [71.3, 75.1] },
  vwcalifornia: { 2020: [74.8, 71.2], 2023: [83.8, 80.3], 2024: [80.6, 80.6], 2025: [81.2, 81.2] },
  // Specialist van converters (one score covers new and used).
  bilbos: { 2022: [94.5, 95.4], 2023: [90.5, 85.6], 2024: [89.1, 89.1], 2025: [87.9, 87.9] },
  wellhouse: { 2022: [98.0, null], 2023: [93.5, 88.8], 2024: [93.5, 93.5] },
  murvi: { 2022: [96.1, null], 2023: [93.5, 84.5] },
  vantage: { 2022: [97.3, null], 2024: [88.5, 88.5], 2025: [90.4, 90.4] },
  consort: { 2024: [95.2, 95.2], 2025: [88.4, 88.4] },
  devon: { 2023: [90.5, 85.6] },
  wildax: { 2022: [89.1, null], 2023: [84.7, null], 2024: [81.4, 81.4], 2025: [82.0, 82.0] },
};

// Owner satisfaction with the base vehicle, average of new and pre-owned, 2022 to 2025.
const BASE_VEHICLE = {
  volkswagen: 90.4, mercedes: 89.6, ford: 87.7, toyota: 83.9, renault: 84.4,
  citroen: 82.9, peugeot: 82.6, fiat: 83.0, man: 89.0, iveco: 83.0, nissan: 82.0, vauxhall: 82.0,
};

// Build tier: points out of 30, from expert reviews and where each brand sits in its group.
const TIER = {
  premium: { pts: 30, label: 'premium build' },
  specialist: { pts: 20, label: 'small specialist converter' },
  upper: { pts: 25, label: 'upper-mid build' },
  volume: { pts: 17, label: 'volume build' },
  value: { pts: 17, label: 'value build' },
  budget: { pts: 12, label: 'budget sub-brand' },
  unknown: { pts: 12, label: 'unrated brand' },
};

// Brands. `osa` points at the owner-survey entry (a group's score stands for its
// sub-brands, with `osaShare` of the weight when the sub-brand is built cheaper);
// `match` is tested against make, model and title together.
export const BRANDS = [
  { key: 'hymer', name: 'Hymer', tier: 'premium', match: /\bhymer\b|\beriba\b|\bhymercar\b/i },
  { key: 'carthago', name: 'Carthago', tier: 'premium', match: /\bcarthago\b/i },
  { key: 'nb', name: 'Niesmann+Bischoff', tier: 'premium', match: /niesmann/i },
  { key: 'frankia', name: 'Frankia', tier: 'premium', match: /\bfrankia\b/i },
  { key: 'levoyageur', name: 'Le Voyageur', tier: 'premium', match: /le voyageur/i },
  { key: 'rapido', name: 'Rapido', tier: 'premium', match: /\brapido\b/i },
  { key: 'laika', name: 'Laika', tier: 'upper', match: /\blaika\b/i },
  { key: 'burstner', name: 'Bürstner', tier: 'upper', match: /b[uü]e?rstner/i },
  { key: 'dethleffs', name: 'Dethleffs', tier: 'upper', match: /\bdethleffs\b/i },
  { key: 'knaus', name: 'Knaus', tier: 'upper', match: /\bknaus\b/i },
  { key: 'pilote', name: 'Pilote', tier: 'upper', match: /\bpilote\b/i, unless: /\bjoa\b/i },
  { key: 'adria', name: 'Adria', tier: 'upper', match: /\badria\b/i },
  { key: 'westfalia', name: 'Westfalia', tier: 'upper', match: /\bwestfalia\b/i },
  { key: 'vwcalifornia', name: 'VW California', tier: 'upper', match: /\bcalifornia\b/i },
  { key: 'chausson', name: 'Chausson', tier: 'volume', match: /\bchausson\b/i },
  { key: 'autosleepers', name: 'Auto-Sleepers', tier: 'volume', match: /auto[\s-]?sleepers?/i },
  { key: 'bailey', name: 'Bailey', tier: 'volume', match: /\bbailey\b/i },
  { key: 'swift', name: 'Swift', tier: 'volume', match: /\bswift\b/i },
  { key: 'bessacarr', name: 'Bessacarr', tier: 'volume', osa: 'swift', match: /\bbessacarr\b/i },
  { key: 'autocruise', name: 'Autocruise', tier: 'volume', osa: 'swift', match: /\bautocruise\b/i },
  { key: 'ace', name: 'Ace', tier: 'volume', osa: 'swift', osaShare: 0.7, match: /^ace\b|\bace (?:\d|milestone|capri|1500|airstream)/i },
  { key: 'autotrail', name: 'Auto-Trail', tier: 'volume', match: /auto[\s-]?trail|autotrail/i },
  { key: 'tribute', name: 'Tribute', tier: 'volume', osa: 'autotrail', match: /\btribute\b/i },
  { key: 'elddis', name: 'Elddis', tier: 'volume', match: /\belddis\b/i, risk: 'Elddis UK factory closing in 2026 (parts and warranty support risk)' },
  { key: 'compass', name: 'Compass', tier: 'volume', osa: 'elddis', match: /\bcompass\b/i, risk: 'Elddis UK factory closing in 2026 (parts and warranty support risk)' },
  { key: 'coachman', name: 'Coachman', tier: 'volume', match: /\bcoachman\b/i },
  { key: 'rollerteam', name: 'Roller Team', tier: 'value', match: /roller[\s-]?team|auto-roller|autoroller/i },
  { key: 'benimar', name: 'Benimar', tier: 'value', match: /\bbenimar\b|\bbenivan\b/i },
  { key: 'rimor', name: 'Rimor', tier: 'value', match: /\brimor\b/i },
  { key: 'mobilvetta', name: 'Mobilvetta', tier: 'value', match: /\bmobilvetta\b/i },
  { key: 'elnagh', name: 'Elnagh', tier: 'value', match: /\belnagh\b/i },
  { key: 'mclouis', name: 'McLouis', tier: 'value', match: /\bmc ?louis\b/i },
  { key: 'etrusco', name: 'Etrusco', tier: 'value', osa: 'hymer', osaShare: 0.5, match: /\betrusco\b/i },
  { key: 'giottiline', name: 'Giottiline', tier: 'value', match: /\bgiottiline\b/i },
  { key: 'hobby', name: 'Hobby', tier: 'value', match: /\bhobby\b/i },
  { key: 'sunliving', name: 'Sun Living', tier: 'budget', osa: 'adria', match: /sun ?living/i },
  { key: 'sunlight', name: 'Sunlight', tier: 'budget', osa: 'dethleffs', match: /\bsunlight\b/i },
  { key: 'carado', name: 'Carado', tier: 'budget', osa: 'hymer', osaShare: 0.5, match: /\bcarado\b/i },
  { key: 'weinsberg', name: 'Weinsberg', tier: 'budget', osa: null, match: /\bweinsberg\b/i },
  { key: 'malibu', name: 'Malibu', tier: 'budget', osa: 'carthago', osaShare: 0.5, match: /\bmalibu\b/i },
  { key: 'joa', name: 'Joa Camp', tier: 'budget', osa: 'pilote', osaShare: 0.5, match: /\bjoa\b/i },
  { key: 'itineo', name: 'Itineo', tier: 'budget', osa: 'rapido', osaShare: 0.5, match: /\bitineo\b/i },
  { key: 'dreamer', name: 'Dreamer', tier: 'budget', osa: 'rapido', osaShare: 0.5, match: /\bdreamer\b/i },
  { key: 'globecar', name: 'Globecar', tier: 'value', match: /\bglobe ?car\b/i },
  { key: 'possl', name: 'Pössl', tier: 'value', match: /p[oö]e?ssl/i },
  { key: 'panama', name: 'Panama', tier: 'value', match: /\bpanama\b/i },
  { key: 'bilbos', name: "Bilbo's", tier: 'specialist', match: /\bbilbo'?s\b/i },
  { key: 'wellhouse', name: 'Wellhouse', tier: 'specialist', match: /\bwellhouse\b/i },
  { key: 'murvi', name: 'Murvi', tier: 'specialist', match: /\bmurvi\b/i },
  { key: 'vantage', name: 'Vantage', tier: 'specialist', match: /\bvantage\b/i },
  { key: 'consort', name: 'Consort', tier: 'specialist', match: /\bconsort\b/i },
  { key: 'devon', name: 'Devon', tier: 'specialist', match: /^devon\b|\bdevon (?:conversions|campers|aurora|monte|tempest|sundowner|discovery)\b/i },
  { key: 'wildax', name: 'Wildax', tier: 'volume', match: /\bwild ?ax\b/i },
  { key: 'autohaus', name: 'Autohaus', tier: 'volume', match: /\bautohaus\b/i },
  { key: 'danbury', name: 'Danbury', tier: 'volume', match: /\bdanbury\b/i },
  { key: 'randger', name: 'Randger', tier: 'value', match: /\brandger\b/i },
  { key: 'euramobil', name: 'Eura Mobil', tier: 'upper', match: /eura ?mobil/i },
  { key: 'morelo', name: 'Morelo', tier: 'premium', match: /\bmorelo\b/i },
  { key: 'megamobil', name: 'Mega Mobil', tier: 'upper', match: /mega ?mobil/i },
  // IH: no owner-survey score (too few owners), but reviewed as one of the best-built UK
  // van conversions (Practical Motorhome 2017, Caravan and Motorhome Club judges). Owners
  // report recurring cracks in the rear GRP panel, so check the rear corners.
  { key: 'ih', name: 'IH', tier: 'upper', match: /^ih$|\bih\b(?=[\s-]+(?:motorhomes|n-?class|tio|fiat|citro[eë]n|peugeot|mercedes|vw|volkswagen|\d{3}))/i, risk: 'rear fibreglass panel cracks reported by owners (check the rear corners)' },
  { key: 'mototrek', name: 'Moto-Trek', tier: 'specialist', match: /moto[\s-]?trek/i },
  { key: 'hillside', name: 'Hillside Leisure', tier: 'volume', match: /\bhillside\b/i },
  { key: 'bodans', name: 'Bodans', tier: 'volume', match: /\bbodans\b/i },
  { key: 'bespoke', name: 'Bespoke Leisure', tier: 'volume', match: /bespoke leisure/i },
  { key: 'aura', name: 'Aura', tier: 'volume', match: /^aura\b/i },
  { key: 'fleurette', name: 'Fleurette', tier: 'value', match: /\bfleurette\b/i },
  { key: 'florium', name: 'Florium', tier: 'value', match: /\bflorium\b/i },
];

// Model-line awards, 2020 to 2026, one per line:
//   year | award | brand key | model pattern (regex) | result | category
// Awards: PM = Practical Motorhome Awards (judged), CAMC = Caravan and Motorhome
// Club Design Awards, OAL = Out&About Live / MMM / What Motorhome Awards, EIA =
// European Innovation Award. Results: W = winner (10 points), HC = highly
// commended or CAMC 2nd place (5), SL = Practical Motorhome shortlist or CAMC 3rd (3).
// A van gets the credit when its model line matches and it was built within four
// years of the award (European Innovation Awards: the award year less one, or later). The year is the award's own label.
const AWARD_LINES = `
2020|PM|elddis|autoquest cv ?60|W|Motorhome of the Year
2020|PM|compass|cv ?60|W|Motorhome of the Year
2020|PM|dreamer|living van|W|Best rear-lounge
2020|PM|autotrail|adventure ?65|W|Best rising-roof camper
2020|PM|swift|edge ?494|W|Best budget
2020|PM|chausson|\\b520\\b|W|Best compact
2020|PM|bailey|advance ?76|W|Best for couples
2020|PM|swift|edge ?486|W|Best family
2020|PM|mobilvetta|kea ?p ?67|W|Best luxury under 3,500 kg
2020|PM|carthago|chic.*e-?line|W|Best luxury over 3,500 kg
2020|PM|rapido|m ?96|W|Best innovation
2020|CAMC|elddis|autoquest cv ?20|W|Van conversion under £50k
2020|CAMC|globecar|summit ?600|HC|Van conversion under £50k
2020|CAMC|wildax|pulsar|W|Van conversion £50-55k
2020|CAMC|autotrail|v-?line ?610|HC|Van conversion £50-55k
2020|CAMC|knaus|boxlife|SL|Van conversion £50-55k
2020|CAMC|mototrek|treka|W|Van conversion £55-65k
2020|CAMC|adria|twin supreme ?640|HC|Van conversion £55-65k
2020|CAMC|wildax|elara|HC|Van conversion over £65k
2020|CAMC|swift|edge ?412|W|Coachbuilt under £50k
2020|CAMC|elddis|accordo ?105|HC|Coachbuilt under £50k
2020|CAMC|bailey|alliance|W|Coachbuilt £50-55k
2020|CAMC|swift|escape compact|HC|Coachbuilt £50-55k
2020|CAMC|elddis|autoquest ?185|SL|Coachbuilt £50-55k
2020|CAMC|bailey|autograph ?69-?2|W|Coachbuilt £55-60k
2020|CAMC|elddis|encore ?250|HC|Coachbuilt £55-60k
2020|CAMC|autotrail|imala ?734|SL|Coachbuilt £55-60k
2020|CAMC|autosleepers|nuevo|W|Coachbuilt £60-75k
2020|CAMC|swift|kon-?tiki sport ?597|HC|Coachbuilt £60-75k
2020|CAMC|bailey|autograph ?79-?4|SL|Coachbuilt £60-75k
2020|CAMC|swift|kon-?tiki ?675|W|Coachbuilt over £75k
2020|CAMC|autotrail|frontier comanche|SL|Coachbuilt over £75k
2020|CAMC|mobilvetta|k-?yacht ?79|W|A-class under £90k
2020|CAMC|knaus|l!?ive ?700|HC|A-class under £90k
2020|CAMC|rollerteam|pegaso ?590|SL|A-class under £90k
2020|CAMC|frankia|i ?8400|W|A-class over £90k
2020|CAMC|carthago|chic.*e-?line|HC|A-class over £90k
2021|EIA|malibu|van|W|Overall concept van
2021|EIA|euramobil|contura|W|Overall concept motorhome
2022|PM|elddis|autoquest ?150|W|Under £60k
2022|PM|joa|75 ?q|SL|Under £60k
2022|PM|autotrail|\\bf ?68\\b|W|Best 2-berth
2022|PM|mclouis|fusion ?330|SL|Under £60k
2022|PM|sunlight|t ?67 ?s|SL|Under £60k
2022|PM|chausson|s ?514|W|Best under 6 m
2022|PM|adria|matrix supreme ?670|W|Under £80k and best for families
2022|PM|adria|matrix ?600 ?sl|SL|Under £80k
2022|PM|mobilvetta|kea ?p ?86|SL|Under £80k
2022|PM|mobilvetta|k-?yacht ?86|SL|Under £80k
2022|PM|autosleepers|broadway el|W|Best under 7 m
2022|PM|frankia|i ?8400|W|Over £80k
2022|PM|autotrail|grand(e)? frontier|W|Best 4-berth
2022|PM|carthago|c-?line|W|Best A-class
2022|PM|burstner|elegance ?910|SL|Over £80k
2022|PM|pilote|696 ?d|SL|Best 2-berth
2022|PM|pilote|626 ?d|SL|Best 2-berth
2022|PM|adria|compact (sc )?supreme|SL|Best 2-berth
2022|PM|rapido|854 ?f|SL|Best 2-berth
2022|PM|bailey|adamo ?69-?4|SL|Best 4-berth
2022|PM|benimar|tessoro ?483|SL|Best 4-berth
2022|PM|bailey|autograph ?81-?6|W|Best 6-berth
2022|PM|adria|coral xl ?670|SL|Best 6-berth
2022|PM|elddis|autoquest ?196|SL|Best 6-berth
2022|PM|benimar|primero ?313|SL|Best 6-berth
2022|PM|rapido|c ?56|SL|Best under 6 m
2022|PM|carado|v ?132|SL|Best under 6 m
2022|PM|laika|kosmo compact|SL|Best under 6 m
2022|PM|chausson|660|SL|Best under 7 m
2022|PM|rapido|c ?50|SL|Best under 7 m
2022|PM|itineo|pc ?640|SL|Best under 7 m
2022|PM|rimor|seal ?12|SL|Best under 7 m
2022|PM|carado|i ?449|SL|Best A-class
2022|PM|mobilvetta|k-?yacht ?90|SL|Best A-class
2022|PM|swift|select compact|W|Best low-profile
2022|PM|dethleffs|globebus|SL|Best low-profile
2022|PM|hymer|t-?class|SL|Best low-profile
2022|PM|burstner|lyseo|W|Best innovation
2022|PM|dethleffs|globetrotter|W|Best for full-time living
2022|PM|swift|kon-?tiki ?784|SL|Best for full-time living
2022|PM|laika|kreos|SL|Best for full-time living
2022|PM|autosleepers|nuevo|W|Best for couples
2022|PM|wildax|europa|SL|Best for couples
2022|PM|bilbos|nexa|SL|Best for couples
2022|PM|knaus|van ti|SL|Best for couples
2022|PM|elddis|autoquest cv ?80|SL|Best for families
2022|PM|itineo|cs ?660|SL|Best for families
2022|PM|pilote|v ?633|SL|Best innovation
2022|PM|carado|cv ?600|W|Van conversion under £50k
2022|PM|sunlight|cliff ?600|SL|Van conversion under £50k
2022|PM|joa|63 ?t|SL|Van conversion under £50k
2022|PM|benimar|benivan ?122|W|Van conversion over £50k
2022|PM|malibu|640|SL|Van conversion over £50k
2022|PM|adria|twin sports ?640|SL|Van conversion over £50k
2022|PM|dreamer|d ?51|SL|Van conversion over £50k
2022|CAMC|autosleepers|\\bair\\b|W|Campervan under 5 m
2022|CAMC|adria|twin sports ?600|W|Pop-top under 6 m
2022|CAMC|wildax|solaris|W|Fixed-roof van over 6 m
2022|CAMC|adria|compact supreme ?dl|W|2-berth coachbuilt
2022|CAMC|chausson|660|W|4-berth coachbuilt
2022|CAMC|adria|coral supreme ?670|W|3/4-berth coachbuilt over 7 m
2022|CAMC|rimor|evo ?77|W|5/6-berth under 8 m
2022|CAMC|bailey|autograph ?81-?6|W|5/6-berth over 8 m
2022|CAMC|mobilvetta|k-?yacht ?59|W|A-class under 7 m
2022|CAMC|adria|sonic supreme|W|A-class 7-8 m
2022|CAMC|frankia|i ?8400|W|A-class over 8 m
2022|EIA|malibu|.|W|Overall concept motorhome
2023|PM|chausson|s ?514|W|Under £60k
2023|PM|joa|60 ?g|SL|Under £60k
2023|PM|rimor|kilig ?9|SL|Under £60k
2023|PM|knaus|tourer van|W|Under £80k
2023|PM|benimar|tessoro ?483|W|Best for couples
2023|PM|burstner|lyseo|W|Over £80k
2023|PM|adria|supersonic ?780|W|Best A-class
2023|PM|coachman|travel ?master|SL|Over £80k and full-time living
2023|PM|joa|75 ?q|W|Best 2-berth
2023|PM|globecar|roadscout|SL|Best 2-berth and couples
2023|PM|carthago|liner-?for-?two|SL|Best 2-berth and A-class
2023|PM|rapido|c ?55|SL|Best 2-berth and couples
2023|PM|burstner|eliseo|W|Best 4-berth
2023|PM|rapido|854 ?f|W|Best for families
2023|PM|weinsberg|x-?cursion van ?500|W|Best under 6 m
2023|PM|dethleffs|just ?go|SL|Best 4-berth and under 7 m
2023|PM|joa|54 ?g|SL|Best under 6 m
2023|PM|adria|twin supreme ?600|W|Van conversion over £60k
2023|PM|elddis|autoquest ?115|W|Best under 7 m
2023|PM|carthago|c-?compactline|SL|Best under 7 m
2023|PM|levoyageur|6\\.8|SL|Best A-class
2023|PM|frankia|\\bmi ?7|SL|Best A-class
2023|PM|swift|voyager ?584|W|Best low-profile
2023|PM|nb|flair|W|Best for full-time living
2023|PM|knaus|van ti plus|SL|Best for full-time living
2023|PM|hymer|venture|W|Best innovation
2023|PM|itineo|sb ?740|SL|Best for families
2023|PM|pilote|v ?633|SL|Van conversion over £60k
2023|PM|hymer|free s|SL|Van conversion over £60k
2023|CAMC|swift|monza|W|Campervan under 5 m
2023|CAMC|autosleepers|\\bair\\b|HC|Campervan under 5 m
2023|CAMC|wildax|proteus|SL|Campervan under 5 m
2023|CAMC|hillside|cromford|HC|Campervan over 5 m
2023|CAMC|adria|twin sports ?600|W|Pop-top
2023|CAMC|autotrail|expedition ?68|HC|Pop-top
2023|CAMC|autotrail|v-?line ?610|W|Fixed-roof van under 6 m
2023|CAMC|autosleepers|symbol|HC|Fixed-roof van under 6 m
2023|CAMC|autosleepers|warwick xl|HC|Fixed-roof van over 6 m
2023|CAMC|mototrek|treka|SL|Fixed-roof van over 6 m
2023|CAMC|autosleepers|nuevo|W|2-berth coachbuilt under 6 m
2023|CAMC|autotrail|f-?line ?f ?62|HC|2-berth coachbuilt under 6 m
2023|CAMC|mototrek|xplora|SL|2-berth coachbuilt under 6 m
2023|CAMC|autosleepers|broadway el|W|2-berth coachbuilt over 6 m
2023|CAMC|autotrail|\\bf-?(line )?f ?68\\b|HC|2-berth coachbuilt over 6 m
2023|CAMC|bailey|adamo ?69-?4|W|3/4-berth under 7 m
2023|CAMC|mobilvetta|kea ?80|HC|3/4-berth under 7 m
2023|CAMC|benimar|tessoro ?481|SL|3/4-berth under 7 m
2023|CAMC|adria|matrix supreme ?670|W|3/4-berth over 7 m
2023|CAMC|benimar|tessoro ?482|HC|3/4-berth over 7 m
2023|CAMC|swift|voyager ?540|HC|3/4-berth over 7 m
2023|CAMC|rollerteam|707|W|5/6-berth under 7.5 m
2023|CAMC|autotrail|expedition c ?72|HC|5/6-berth under 7.5 m
2023|CAMC|rimor|kilig ?695|SL|5/6-berth under 7.5 m
2023|CAMC|autotrail|frontier scout|W|5/6-berth over 7.5 m
2023|CAMC|carthago|c-?tourer t ?148|HC|5/6-berth over 7.5 m
2023|CAMC|mobilvetta|k-?yacht ?80|W|A-class under 7 m
2023|CAMC|rollerteam|pegaso ?590|HC|A-class under 7 m
2023|CAMC|adria|supersonic ?780|W|A-class 7-8 m
2023|CAMC|mobilvetta|k-?yacht ?95|HC|A-class 7-8 m
2023|CAMC|carthago|liner-?for-?two|SL|A-class 7-8 m
2023|CAMC|frankia|i ?8400|HC|A-class over 8 m
2023|CAMC|autotrail|grand(e)? frontier|SL|A-class over 8 m
2023|OAL|hymer|venture|W|Motorhome of the Year
2023|EIA|burstner|lyseo|W|Overall concept motorhome
2023|EIA|knaus|tourer cuv|W|Overall concept van
2023|EIA|sunlight|cliff ?4x4|W|Overall concept 4x4
2023|EIA|nb|flair|W|Interior design and safety
2023|EIA|hymer|venture|W|Exterior design
2024|PM|dethleffs|globetrail|W|Best under 6 m
2024|PM|pilote|v ?600|W|Best 2-berth
2024|PM|dethleffs|globebus go|SL|Best under 6 m and low-profile
2024|PM|rapido|c ?o3|W|Best for couples
2024|PM|pilote|atlas|SL|Best for couples, 4-berth, under 7 m and low-profile
2024|PM|adria|twin max|SL|Best for couples and innovation
2024|PM|carthago|c-?tourer i ?145|SL|Best 2-berth, full-time and A-class
2024|PM|wildax|pulsar|SL|Best 2-berth
2024|PM|mobilvetta|k-?yacht tekno|SL|Best 2-berth
2024|PM|nb|flair|W|Best for full-time living
2024|PM|laika|kreos|W|Best A-class
2024|PM|rapido|c ?86|SL|Best A-class
2024|PM|adria|supersonic ?780|SL|Best A-class, full-time and luxury
2024|PM|swift|voyager ?494|W|Best 4-berth
2024|PM|rapido|606 ?f|W|Best under 7 m
2024|PM|benimar|mileo ?282|SL|Best 4-berth
2024|PM|swift|voyager ?475|W|Best for families
2024|PM|levoyageur|eterna|W|Best luxury motorhome
2024|PM|itineo|ps ?700|W|Best budget motorhome
2024|PM|malibu|comfort ?640|SL|Best for families and luxury campervan
2024|PM|dreamer|d ?68|SL|Best under 7 m
2024|PM|chausson|x ?650|W|Best low-profile
2024|PM|hymer|ml-?t ?580|SL|Best low-profile
2024|PM|adria|active duo|W|Best small campervan
2024|PM|vantage|luna|SL|Best small campervan
2024|PM|bodans|holywell|W|Best budget campervan
2024|PM|vantage|fuze|SL|Best budget campervan
2024|PM|joa|60 ?f|SL|Best budget motorhome
2024|PM|carado|t ?457|SL|Best budget motorhome
2024|PM|autosleepers|m-?star|W|Best luxury campervan
2024|PM|burstner|playa|SL|Best luxury campervan
2024|PM|bailey|endeavour|SL|Best luxury campervan
2024|CAMC|autosleepers|\\bair\\b|W|Campervan under 5 m
2024|CAMC|adria|active duo|HC|Campervan under 5 m
2024|CAMC|bailey|endeavour ?b ?64|W|Pop-top 6 m and under
2024|CAMC|malibu|diversity|HC|Pop-top 6 m and under
2024|CAMC|adria|twin sports ?640|W|Pop-top over 6 m
2024|CAMC|autotrail|expedition ?68|W|Judges' award
2024|CAMC|adria|twin supreme ?600|HC|Fixed-roof van 6 m and under
2024|CAMC|bailey|endeavour ?b ?62|SL|Fixed-roof van 6 m and under
2024|CAMC|adria|twin max ?680|HC|Fixed-roof van over 6 m
2024|CAMC|autosleepers|nuevo|W|2-berth coachbuilt 6 m and under
2024|CAMC|benimar|primero ?201|HC|2-berth coachbuilt 6 m and under
2024|CAMC|euramobil|xtura|W|2-berth coachbuilt over 6 m
2024|CAMC|autotrail|excel ?675|HC|2-berth coachbuilt over 6 m
2024|CAMC|adria|compact supreme|SL|2-berth coachbuilt over 6 m
2024|CAMC|bailey|alora|W|3/4-berth 7 m and under
2024|CAMC|autotrail|excel ?690|HC|3/4-berth 7 m and under
2024|CAMC|benimar|mileo ?243|SL|3/4-berth 7 m and under
2024|CAMC|euramobil|activa one|SL|3/4-berth 7 m and under
2024|CAMC|adria|matrix supreme ?670|W|3/4-berth over 7 m
2024|CAMC|bailey|adamo ?75|HC|3/4-berth over 7 m
2024|CAMC|euramobil|contura|SL|3/4-berth over 7 m
2024|CAMC|rollerteam|707|W|5/6-berth
2024|CAMC|rimor|kilig ?9|HC|5/6-berth
2024|CAMC|mobilvetta|k-?yacht ?59|W|A-class under 7 m
2024|CAMC|rollerteam|pegaso ?590|HC|A-class under 7 m
2024|CAMC|euramobil|integra|SL|A-class under 7 m
2024|CAMC|frankia|i ?7400|W|A-class 7-8 m
2024|CAMC|carthago|c-?tourer i ?145|HC|A-class 7-8 m
2024|CAMC|mobilvetta|k-?yacht ?95|SL|A-class 7-8 m
2024|CAMC|adria|supersonic ?890|W|A-class over 8 m
2024|OAL|chausson|x ?650|W|Motorhome of the Year
2024|OAL|swift|voyager ?475|W|Best family motorhome
2024|OAL|hymer|ml-?t ?570|HC|Best fixed single bed motorhome
2024|EIA|hymer|ml-?t|W|Overall concept motorhome
2024|EIA|euramobil|xtura|W|Overall concept 4x4
2024|EIA|knaus|yaseo|W|Audience focus
2025|PM|nb|arto|W|Best luxury motorhome
2025|PM|hymer|ml-?t ?570|W|Best for full-time living
2025|PM|carthago|c2[\\s-]?tourer|W|Best A-class
2025|PM|etrusco|6\\.8|W|Best budget motorhome
2025|PM|etrusco|cv ?640|W|Best budget campervan
2025|PM|chausson|s ?69[57]|W|Best 2-berth motorhome
2025|PM|chausson|\\b630\\b|HC|Best 4-berth
2025|PM|chausson|\\b660\\b|HC|Best for full-time living
2025|PM|rollerteam|kronos|HC|Best budget and for couples
2025|PM|swift|voyager ?510|W|Best 4-berth motorhome
2025|PM|swift|trekker ?x|W|Best campervan for solo travel
2025|PM|mclouis|fusion|HC|Best 4-berth and innovation
2025|PM|laika|kosmo|W|Best motorhome under 6 m
2025|PM|benimar|tessoro ?840|HC|Best under 6 m
2025|PM|benimar|primero ?202|HC|Best for families
2025|PM|dethleffs|globebus|HC|Best under 6 m
2025|PM|bailey|adamo ?60-?2|HC|Best 2-berth motorhome
2025|PM|bailey|endeavour ?b ?63|W|Best 2-berth campervan with washroom
2025|PM|bailey|endeavour ?b ?65|HC|Best campervan for a family of 4
2025|PM|pilote|720|W|Best motorhome for couples
2025|PM|itineo|sbd ?700|W|Best motorhome for families
2025|PM|burstner|campeo|HC|Best motorhome for families
2025|PM|frankia|platin|HC|Best for full-time living
2025|PM|elnagh|baron|W|Best motorhome under 7 m
2025|PM|adria|compact max|HC|Best under 7 m and low-profile
2025|PM|autotrail|excel|W|Best for innovation
2025|PM|coachman|travel ?master|W|Best low-profile motorhome
2025|PM|rapido|i ?196|HC|Best A-class
2025|PM|levoyageur|7\\.6|HC|Best A-class
2025|PM|elddis|autoquest cv ?60|HC|Best budget and solo campervan
2025|PM|malibu|genius|W|Best luxury campervan
2025|PM|hymer|grand canyon|HC|Best luxury campervan
2025|PM|mobilvetta|admiral|HC|Best luxury campervan
2025|PM|autohaus|spartan|W|Best small campervan
2025|PM|autohaus|camelot|HC|Best family and VW campervan
2025|PM|dreamer|cap land|HC|Best small campervan
2025|PM|panama|p ?12\\b|W|Best campervan for everyday use
2025|PM|panama|p ?57\\b|W|Best campervan for a family of 4
2025|PM|vantage|ora|HC|Best 2-berth campervan with washroom
2025|PM|wildax|meteor|HC|Best 2-berth campervan with washroom
2025|PM|hymer|eriba ?car|W|Best VW campervan
2025|CAMC|swift|monza|W|Campervan over 5 m
2025|CAMC|bailey|endeavour ?b ?65|SL|Pop-top under 6 m
2025|CAMC|adria|twin sports ?600|HC|Pop-top under 6 m
2025|CAMC|swift|carrera ?244|W|Pop-top 6 m and over
2025|CAMC|autotrail|expedition ?68|HC|Pop-top 6 m and over
2025|CAMC|bailey|endeavour ?b ?63|W|Fixed-roof van 6 m and under
2025|CAMC|swift|trekker xl|SL|Fixed-roof van 6 m and under
2025|CAMC|wildax|solaris|W|Fixed-roof van over 6 m
2025|CAMC|aura|\\b7\\b|SL|Fixed-roof van over 6 m
2025|CAMC|autosleepers|nuevo|W|2-berth coachbuilt 6 m and under
2025|CAMC|elddis|accordo ?105|HC|2-berth coachbuilt 6 m and under
2025|CAMC|rollerteam|kronos|SL|2-berth coachbuilt 6 m and under
2025|CAMC|bailey|adamo ?60-?2|W|2-berth coachbuilt over 6 m
2025|CAMC|autotrail|excel ?620|HC|2-berth coachbuilt over 6 m
2025|CAMC|elddis|avalon ?295|SL|2-berth coachbuilt over 6 m
2025|CAMC|bailey|adamo ?69-?4|W|3/4-berth 7 m and under
2025|CAMC|rollerteam|t-?line ?700|HC|3/4-berth 7 m and under
2025|CAMC|euramobil|activa one|SL|3/4-berth 7 m and under
2025|CAMC|swift|escape ?674|W|3/4-berth over 7 m (Coachbuilt GB LIV)
2025|CAMC|autosleepers|burford|HC|3/4-berth over 7 m
2025|CAMC|adria|matrix supreme ?670|SL|3/4-berth over 7 m
2025|CAMC|bailey|adamo xl|W|5/6-berth
2025|CAMC|sunliving|a ?70|HC|5/6-berth
2025|CAMC|rollerteam|zefiro ?675|SL|5/6-berth
2025|CAMC|carthago|c2[\\s-]?tourer|W|A-class under 8 m
2025|CAMC|euramobil|integra|HC|A-class under 8 m
2025|CAMC|rollerteam|pegaso ?745|SL|A-class under 8 m
2025|CAMC|adria|supersonic ?890|HC|A-class over 8 m
2025|OAL|malibu|genius|W|Motorhome of the Year
2025|OAL|nb|arto|W|Best luxury motorhome
2025|OAL|hymer|eriba ?car|W|Best fixed bed campervan
2025|OAL|swift|trekker|W|Coolest campervan
2025|EIA|nb|arto|W|Overall concept motorhome
2025|EIA|adria|twin|W|Interior design
2026|PM|chausson|798|W|Best island bed
2026|PM|burstner|signature|W|Best for innovation
2026|PM|burstner|signature|HC|Best island bed
2026|PM|swift|trekker ?594|HC|Best island bed
2026|PM|pilote|atlas ?a ?630|W|Best 2-berth
2026|PM|autosleepers|nuevo ek plus|HC|Best 2-berth
2026|PM|levoyageur|6\\.9|HC|Best 2-berth
2026|PM|swift|trekker ?540|W|Best 4-berth
2026|PM|swift|trekker ?540|HC|Best for innovation
2026|PM|adria|matrix ?670|HC|Best 4-berth
2026|PM|elddis|apex|HC|Best 4-berth
2026|PM|autosleepers|burford|W|Best for couples
2026|PM|autotrail|frontier delaware|HC|Best for couples
2026|PM|rimor|sailer ?55|HC|Best for couples
2026|PM|elddis|whirlwind gt ?196|W|Best for families
2026|PM|swift|trekker ?584|HC|Best for families
2026|PM|bailey|autograph ?81-?5|W|Best rear lounge
2026|PM|bailey|autograph ?81-?5|HC|Best for families
2026|PM|swift|kon-?tiki ?894|W|Best for full-time living
2026|PM|nb|arto ?84|HC|Best for full-time living
2026|PM|bailey|adamo xl|HC|Best for full-time living
2026|PM|mobilvetta|kea kompakt|W|Best under 7 m
2026|PM|fleurette|migrateur|HC|Best under 7 m
2026|PM|florium|baxter|HC|Best under 7 m
2026|PM|rimor|sailer ?56|W|Best budget motorhome
2026|PM|autotrail|imala ?736|HC|Best rear lounge
2026|PM|chausson|627|HC|Best fixed single beds
2026|PM|coachman|avventura|HC|Best fixed single beds
2026|PM|itineo|cozi|HC|Best budget motorhome
2026|PM|giottiline|siena|HC|Best budget motorhome
2026|PM|carthago|liner-?for-?two|W|Best luxury motorhome
2026|PM|laika|kreos|HC|Best luxury motorhome
2026|PM|frankia|noctra|HC|Best luxury motorhome
2026|PM|carado|cv ?541|W|Best budget campervan
2026|PM|carado|cv ?541|HC|Best 2-berth campervan with washroom
2026|PM|elddis|whirlwind gtv|HC|Best budget and value campervan
2026|PM|autotrail|expedition ?68 ?xl|HC|Best budget campervan
2026|PM|megamobil|lounge|W|Best luxury campervan
2026|PM|laika|kosmo ?60|HC|Best luxury campervan
2026|PM|westfalia|jules verne|HC|Best luxury campervan
2026|PM|autotrail|expedition ?54|W|Best small campervan
2026|PM|panama|p ?10|W|Best campervan for everyday use
2026|PM|wildax|equinox|HC|Best campervan for everyday use
2026|PM|autosleepers|active|W|Best campervan for a family of 4
2026|PM|bailey|endurance|HC|Best campervan for a family of 4
2026|PM|adria|supertwin|HC|Best campervan for a family of 4
2026|PM|burstner|habiton|W|Best 2-berth campervan with washroom
2026|PM|malibu|relax ?640|W|Best value campervan
2026|PM|rapido|v ?62|HC|Best value campervan
2026|PM|pilote|v ?630 ?s|HC|Best campervan for solo travel
2026|CAMC|hillside|cromford|W|LWB campervan
2026|CAMC|bespoke|explore|W|Hybrid campervan
2026|CAMC|panama|p ?10|HC|Hybrid campervan
2026|CAMC|hillside|mvx|SL|Hybrid campervan
2026|CAMC|bailey|endeavour ?b ?65|HC|Pop-top 6 m and under
2026|CAMC|adria|twin sports ?600|SL|Pop-top 6 m and under
2026|CAMC|ace|1200|W|Pop-top over 6 m
2026|CAMC|autotrail|expedition ?68|HC|Pop-top over 6 m
2026|CAMC|autosleepers|active|SL|Pop-top over 6 m
2026|CAMC|autosleepers|symbol|W|Fixed-roof van 6 m and under
2026|CAMC|bailey|endurance ?e ?62|HC|Fixed-roof van 6 m and under
2026|CAMC|bespoke|crafter|HC|Fixed-roof van 6 m and under
2026|CAMC|wildax|solaris|W|Fixed-roof van over 6 m
2026|CAMC|adria|twin supreme ?640|HC|Fixed-roof van over 6 m
2026|CAMC|vantage|neo|SL|Fixed-roof van over 6 m
2026|CAMC|autosleepers|nuevo|W|2-berth coachbuilt 6.5 m and under
2026|CAMC|autotrail|imala ?615|HC|2-berth coachbuilt 6.5 m and under
2026|CAMC|rollerteam|kronos|SL|2-berth coachbuilt 6.5 m and under
2026|CAMC|bailey|autograph ?72-?2|W|2-berth coachbuilt over 6.5 m
2026|CAMC|adria|compact supreme|HC|2-berth coachbuilt over 6.5 m
2026|CAMC|coachman|sportivo|HC|2-berth coachbuilt over 6.5 m
2026|CAMC|bailey|adamo ?69-?4|W|3/4-berth 7 m and under
2026|CAMC|rollerteam|t-?line ?700|HC|3/4-berth 7 m and under
2026|CAMC|rimor|sailer|SL|3/4-berth 7 m and under
2026|CAMC|coachman|travel ?master ?545|W|3/4-berth over 7 m
2026|CAMC|bailey|autograph ?79-?4|HC|3/4-berth over 7 m
2026|CAMC|swift|trekker ?584|SL|3/4-berth over 7 m
2026|CAMC|rollerteam|746|W|5/6-berth 7.5 m and under
2026|CAMC|elddis|apex ?196|HC|5/6-berth 7.5 m and under
2026|CAMC|autotrail|expedition c ?72|SL|5/6-berth 7.5 m and under
2026|CAMC|bailey|autograph ?81-?5|W|5/6-berth over 7.5 m
2026|CAMC|autotrail|frontier comanche|HC|5/6-berth over 7.5 m
2026|CAMC|adria|supersonic ?780|W|A-class under 8 m
2026|CAMC|rollerteam|pegaso ?740|SL|A-class under 8 m
2026|CAMC|autotrail|grand(e)? frontier|HC|A-class over 8 m
2026|OAL|swift|trekker ?540|W|Motorhome of the Year
2026|OAL|burstner|b ?66 ?600|W|Campervan of the Year
2026|OAL|burstner|b ?66 ?594|HC|Best compact motorhome
2026|OAL|bailey|autograph ?81-?5|HC|Best family motorhome
2026|OAL|bailey|endurance ?e ?65|HC|Best fixed double bed campervan
2026|EIA|burstner|signature|W|Overall concept motorhome and interior design
2026|EIA|knaus|boxtime|W|Overall concept van
2026|EIA|frankia|noctra|W|Exterior design
`;

const AWARD_NAMES = { PM: 'Practical Motorhome Awards', CAMC: 'Caravan and Motorhome Club Design Awards', OAL: 'Out&About Live / MMM Awards', EIA: 'European Innovation Award' };
export const AWARD_POINTS = { W: 10, HC: 5, SL: 3 };

export const AWARDS = AWARD_LINES.trim().split('\n').map((line) => {
  const [year, award, key, pattern, result, category] = line.split('|');
  return { year: Number(year), award, key, re: new RegExp(pattern, 'i'), result, label: `${AWARD_NAMES[award]} ${year}: ${category}` };
});

export const QUALITY_GRADES = [[75, 'A+'], [62, 'A'], [50, 'B'], [38, 'C'], [0, 'D']];
export const gradeFor = (score) => QUALITY_GRADES.find(([min]) => score >= min)[1];

const round1 = (n) => Math.round(n * 10) / 10;

/** Which brand an advert is. Make first, then model and title. */
export function brandOf(advert) {
  const make = advert.make || '';
  const all = [make, advert.model, advert.title].filter(Boolean).join(' ');
  // A sub-brand named anywhere wins over the group make ("Adria Sun Living" is a Sun Living).
  const sub = BRANDS.find((b) => b.osa !== undefined && b.match.test(all) && !(b.unless && b.unless.test(all)));
  if (sub) return sub;
  for (const text of [make, all]) {
    const hit = BRANDS.find((b) => b.match.test(text) && !(b.unless && b.unless.test(all)));
    if (hit) return hit;
  }
  return null;
}

// These come from the survey's separate van-converter table: small, loyal owner groups
// and a higher Gold bar (85% against 80%), so their scores run about 8 points hotter
// than the motorhome manufacturer tables. Taken down by that much to sit on one scale.
const CONVERTER_TABLE = new Set(['bilbos', 'wellhouse', 'murvi', 'vantage', 'consort', 'devon', 'wildax', 'vwcalifornia']);
const CONVERTER_OFFSET = 8;

/** Owner satisfaction, %: recent years count more, and pre-owned scores more than new (this is a used-van search). */
function ownerSatisfaction(key) {
  const years = OSA[key];
  if (!years) return null;
  const offset = CONVERTER_TABLE.has(key) ? CONVERTER_OFFSET : 0;
  const yearWeight = { 2025: 1, 2024: 0.9, 2023: 0.8, 2022: 0.7, 2020: 0.5 };
  let sum = 0, w = 0, n = 0;
  for (const [y, [fresh, used]] of Object.entries(years)) {
    const yw = yearWeight[y] ?? 0.5;
    if (fresh != null) { sum += fresh * yw * 0.4; w += yw * 0.4; n++; }
    if (used != null) { sum += used * yw * 0.6; w += yw * 0.6; n++; }
  }
  return w ? { pct: sum / w - offset, n, converter: offset > 0 } : null;
}

function baseVehicleOf(advert) {
  const text = [advert.details?.chassis, advert.make, advert.model, advert.title].filter(Boolean).join(' ').toLowerCase();
  if (/mercedes|sprinter/.test(text)) return 'mercedes';
  if (/volkswagen|\bvw\b|crafter|transporter|california/.test(text)) return 'volkswagen';
  if (/\bman\b|\btge\b/.test(text)) return 'man';
  if (/\bford\b|transit/.test(text)) return 'ford';
  if (/peugeot|peugot|boxer/.test(text)) return 'peugeot';
  if (/citro[eë]n|relay|jumper/.test(text)) return 'citroen';
  if (/renault|master|trafic/.test(text)) return 'renault';
  if (/iveco|daily/.test(text)) return 'iveco';
  if (/toyota/.test(text)) return 'toyota';
  if (/nissan/.test(text)) return 'nissan';
  if (/vauxhall|movano|vivaro/.test(text)) return 'vauxhall';
  if (/fiat|ducato/.test(text)) return 'fiat';
  return null;
}

/**
 * Quality rating for one advert: { score, grade, brand, tier, parts, awards }.
 * `parts` holds each component's points so the dashboard can show its working.
 */
export function rateQuality(advert) {
  const brand = brandOf(advert);
  const parts = [];
  const add = (label, pts) => { pts = round1(pts); parts.push({ label, pts }); return pts; };
  let score = 0;

  // Owner satisfaction, up to 45: 70% scores nothing, 88% scores full marks. Brands
  // the surveys could not score get 15, about what a 76% brand earns.
  const osaKey = brand ? (brand.osa === undefined ? brand.key : brand.osa) : null;
  const osa = osaKey ? ownerSatisfaction(osaKey) : null;
  if (osa) {
    const share = brand.osaShare ?? 1;
    const own = Math.max(0, Math.min(45, ((osa.pct - 70) / 18) * 45));
    const pts = own * share + 15 * (1 - share); // a cheaper sub-brand only partly inherits its group's score
    score += add(`owners rate ${osaKey === brand.key ? brand.name : 'its group'} ${osa.pct.toFixed(1)}%${osa.converter ? ' (van-converter survey, put on the motorhome scale)' : ''}${share < 1 ? ' (group, part credit)' : ''}`, pts);
  } else {
    score += add(brand ? `${brand.name}: too few owners surveyed` : 'brand not in the owner surveys', 15);
  }

  // Build tier, up to 30.
  const tier = TIER[brand?.tier || 'unknown'];
  score += add(tier.label, tier.pts);

  // Model awards, up to 15: 10 a win, 5 highly commended, 3 shortlisted; each award counted once.
  const awards = [];
  if (brand) {
    const text = [advert.model, advert.title, advert.subTitle].filter(Boolean).join(' ');
    const seen = new Set();
    for (const { year, award, key, re, result, label } of AWARDS) {
      if (key !== brand.key || !re.test(text)) continue;
      if (advert.year && Math.abs(advert.year - year) > 4) continue;
      if (award === 'EIA' && advert.year && advert.year < year - 1) continue; // innovation awards go to new designs, not older vans of the same name
      if (seen.has(label)) continue;
      seen.add(label);
      awards.push({ year, result, label });
    }
    awards.sort((x, y) => AWARD_POINTS[y.result] - AWARD_POINTS[x.result] || y.year - x.year);
  }
  if (awards.length) {
    const wins = awards.filter((a) => a.result === 'W').length;
    const pts = Math.min(15, awards.reduce((n, a) => n + AWARD_POINTS[a.result], 0));
    score += add(`model awards: ${wins} win${wins === 1 ? '' : 's'}, ${awards.length - wins} commended or shortlisted`, pts);
  }

  // Base vehicle, up to 10: 78% scores nothing, 92% full marks.
  const base = baseVehicleOf(advert);
  const basePct = base ? BASE_VEHICLE[base] : null;
  score += add(base ? `${base === 'man' ? 'MAN' : base[0].toUpperCase() + base.slice(1)} base vehicle` : 'base vehicle unknown', basePct ? Math.max(0, Math.min(10, ((basePct - 78) / 14) * 10)) : 4);

  if (brand?.risk) score += add(brand.risk, -3);

  const final = Math.max(0, Math.min(100, Math.round(score)));
  return { score: final, grade: gradeFor(final), brand: brand?.name || null, tier: brand?.tier || 'unknown', parts, awards };
}

// ---------------------------------------------------------------------------
// Quality for money: the quality score set against the price, compared with
// live vans of the same age and body type. 50 is what that money normally
// buys; each 10% over the usual price for its age costs about five points.

const BASE_MAKES = /^(volkswagen|vw|fiat|peugeot|ford|citroen|mercedes|mercedes-benz|renault|vauxhall|nissan|kia|man|iveco|toyota|hyundai|maxus|land rover|isuzu)$/i;
const bodyGroup = (a) => {
  const b = (a.fit?.bodyType || a.details?.bodyType || '').toLowerCase();
  if (/a ?class/.test(b)) return 'aclass';
  if (/camper|conversion|\bcv\b|high top|micro/.test(b)) return 'van';
  if (/coach|motorhome|low profile|overcab|c class|\bmh\b|hi line/.test(b)) return 'coach';
  // No body type given: a base-vehicle make or a specialist converter is a van conversion.
  if (BASE_MAKES.test((a.make || '').trim()) || a.quality?.tier === 'specialist') return 'van';
  return 'coach';
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

/** Adds quality.forMoney (0-100) and quality.priceIndex to every active advert that has a quality score. */
export function rateQualityForMoney(adverts) {
  const pool = adverts.filter((a) => a.status === 'active' && !a.excluded && a.quality && a.price > 0 && a.year > 1990);
  const groups = new Map();
  const put = (k, a) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); };
  for (const a of pool) {
    if (a.newStock) continue; // list-priced stock would skew what used money buys
    put(`${a.year}|${bodyGroup(a)}`, a);
    put(`${a.year}|*`, a);
  }
  const stats = new Map();
  const statFor = (k) => {
    if (!stats.has(k)) {
      const g = groups.get(k) || [];
      stats.set(k, g.length >= 12 ? { price: median(g.map((a) => a.price)), quality: median(g.map((a) => a.quality.score)), n: g.length } : null);
    }
    return stats.get(k);
  };
  for (const a of pool) {
    const body = bodyGroup(a);
    const near = (y) => (body && statFor(`${y}|${body}`)) || statFor(`${y}|*`);
    const s = near(a.year) || near(a.year - 1) || near(a.year + 1);
    if (!s) { a.quality.forMoney = null; continue; }
    const priceIndex = a.price / s.price;
    const forMoney = 50 + (a.quality.score - s.quality) - 50 * Math.log(priceIndex);
    a.quality.forMoney = Math.max(0, Math.min(100, Math.round(forMoney)));
    a.quality.priceIndex = Math.round(priceIndex * 100) / 100;
    a.quality.peer = { price: Math.round(s.price), quality: Math.round(s.quality), n: s.n, body: body && statFor(`${a.year}|${body}`) ? body : 'all' };
  }
}
