# Motorhome search

A small robot that checks Autotrader UK for motorhomes every morning, remembers what it has seen, and tells you about adverts that are **new** or have **dropped in price**. A dashboard on GitHub Pages lists every matched advert with its price history.

It runs on GitHub Actions, so nothing needs to be switched on at home.

> **Caveats.** Autotrader has no public API, and its terms of service do not allow automated reading of the site. This project reads the same JSON feed the search page itself uses, which is far more stable than scraping HTML, but it will still break from time to time when Autotrader changes things, and Autotrader may block it. Autotrader's own "save this search" email alert is the officially supported alternative.

## How it works

1. `search.config.json` lists your searches. Each one is either a pasted Autotrader URL or a block of criteria.
2. `.github/workflows/daily.yml` runs `src/run.js` once a day (and whenever you press **Run workflow**) on a self-hosted runner, see "Where it runs".
3. The job fetches every search, compares the results with `docs/data/listings.json`, and commits the updated file back to the repo.
4. It reads each new advert's page for its kit and description, scores it, and if anything is new sends a Telegram message and/or an email. If nothing changed, it stays quiet.
5. `docs/index.html` is the dashboard. GitHub Pages serves it from the `docs/` folder.

## Spotting the good ones

The search results only carry the headline facts, so after each run the job also opens every new advert's own page once and reads the seller's features list, description, owner count, service history and history check. From that it works out two things, shown on the dashboard and in notifications:

- **Kit.** Each advert is matched against a list of equipment: Alde wet central heating, habitation air conditioning (a Truma or Dometic roof unit, as opposed to cab air con, which is listed separately and worth nothing), self-levelling, rear air suspension, 360° camera, reversing camera, automatic, solar, lithium, inverter, diesel heater, cruise control, tow bar, awning, satellite TV, full service history. Each item carries a rough fitted value in pounds.
- **Star spec.** The kit you most want goes in `deals.wantedSpecs` in `search.config.json`; at the moment that is Alde heating, 360° camera, habitation air conditioning and self-levelling. Every advert whose page has been read is scored against it, shown as stars on its dashboard card (★★☆☆ 2/4, with what it has and what it is missing) and as a line in each notification. The dashboard also has a **Star spec** view, tiles for adverts with the full set and with `deals.minWantedSpecs` or more items, a sort by most star items, and a legend showing how many live adverts carry each item; tap an item to see just those. An advert not read yet shows "star spec not checked yet" rather than a zero.
- **Price against similar adverts, net of kit.** The kit values are subtracted from every price, then each advert is compared with similar live adverts: same make and model within two years of its age; failing that the same chassis, body type and berth count; failing that the same make within one year. With eight or more comparables the expected price is adjusted for age and mileage by a small regression, otherwise the median is used. "−14% vs 12 similar, £6,000 of kit" means that after allowing for its kit the van is 14% cheaper than twelve comparable adverts predict. The more adverts your searches cover, the better this gets, which is why the example search reads the whole market.
- **Days on market, price drops and desperation.** Autotrader advert ids start with the date the advert was created, which is also the date Autotrader's own "newest first" sort uses, so the dashboard shows how long each advert has been up even on the first run, plus how many times and how far its price has dropped since the job started watching it. For private sellers the date is sound: their adverts expire and have to be re-created. A dealer's stock feed can create the advert before the vehicle is registered, or withdraw and re-publish the same record, so a dealer advert older than the vehicle or than two years is shown with a "?" and not counted as time unsold. These combine into a desperation score out of 100: price cuts the job has actually seen carry up to 60 (15 per cut up to 30, plus up to 30 for the total cut, full marks at 10% off), time unsold up to 30 (from a month to six months, trusted dates only) and 10 for a private seller. A seller is flagged **motivated** when the score reaches `deals.motivatedScore` (default 40) *and* there is real evidence: at least one price cut, or a private seller listed longer than `deals.staleDays`. A dealer advert that has sat for months at the same price is more likely overpriced than a bargain, so time alone never counts. The advert joins the worth-a-look list at `deals.dealScore` (default 50), which in practice needs a cut or two.
- **Pick score.** One number out of 100 to rank on, with its working shown on the card: star spec up to 35, nice-to-have kit up to 10, price against similar adverts up to 20 (live comparables blended with the sold benchmark when there is one), seller motivation up to 15, provenance up to 10 (private seller, full service history, one owner, warranty, habitation check, cam belt, low mileage for its age, three years old or less), a couple of points for re-listed or due a cut, and 25 off per red flag. The dashboard's **Top picks** view shows everything at or above `deals.topPickScore` (40, roughly the top 1% of the market) and the default sort is by pick score.
- **Seller signals.** Phrases that tell you how to approach the seller: "open to offers" or "ONO", "quick sale", "relocating", "reduced", part exchange welcome, one owner, cam belt done, new tyres, warranty included, habitation check, winterised. They are shown as 💬 chips on the card; the first three add up to 25 points to the desperation score and count as evidence of a motivated seller. Override with a top-level `"signals"` list in the config.
- **Days to sell, sold benchmark, due a cut, re-listed.** From the adverts that have gone: the median days from listing to gone for this model (else this make, else the whole market), shown as "this model sells in ~25d"; the median asking price of same-model adverts within two years of its age when they went off sale, shown as "−8% vs 6 sold", which is closer to what was paid than live asking prices; **due a cut** for adverts listed `deals.staleNoCutDays` (default 50) or more with no price cut yet, since dealers tend to cut at 60 to 90 days; and **re-listed** when a live advert has the same make, model, year, registration and mileage (within 1%) as one that went off sale, which means a sale fell through, a van came back, or a dealer reset the listing age.
- **Fit.** The spec sheet's weight plate (MTPLM), payload, engine power, gearbox, berths, seats, bed and end layout, height, width and emission class are parsed into facts shown on each card, and the dashboard has a **Fit** row to narrow by any of them (3,500 kg for a B licence, automatic, 140+ bhp, a bed layout, height for car parks, distance from the search postcode, Euro 6, used or new stock). Adverts whose sheet does not say are kept, not hidden. Dealers' form defaults (2,000 mm high, a 3,500 kg "payload") are ignored.
- **New and ex-demo stock.** This year's or last year's van with delivery mileage from a dealer is tagged and left out of the used-market price comparison on both sides, so list-price stock does not make used vans look cheap or dear.
- **Nice-to-have kit.** A second tier in `deals.niceToHave` (rear air suspension, solar, lithium, automatic, tow bar). Each is one point in the kit score against three per star item; sort by **Kit score** to rank on both.
- **Red flags.** Left-hand drive, imported, damp described as present (not "damp check all clear"), water ingress, write-off category, spares or repair, four or more owners, a failed history check. Shown on the card and they keep an advert out of the worth-a-look list.
- **Unconverted vans.** Autotrader's motorhome channel contains plain panel vans. Anything whose page says fewer than `details.excludeIfBerthBelow` berths is hidden.
- **Length.** Autotrader's own length filter only catches adverts where the seller filled the length in, which is a minority of van conversions. So the job also works out length itself from the spec sheet, a figure stated in the advert, or the base vehicle and wheelbase code (Ducato L4 is 6.36 m, Sprinter LWB 6.97 m, a VW Transporter about 5 m) and checks it against `length.minMetres` to `length.maxMetres`. With `length.mode` set to `"flag"` (the current setting) every advert stays on the dashboard, the ones outside the range carry a ⚑ on their length, and a **My length only** toggle narrows the page, tiles and star-spec counts to the range. With `"hide"` they are taken off the page instead and kept under **Hidden by rules** with the reason. Adverts whose length cannot be worked out are marked "length unknown" and count as in range unless `length.hideUnknown` is set.
- **Whole market.** The third search, "All motorhomes (star spec research)", reads every motorhome, campervan and van conversion in the price and year band regardless of length or body type, so the star spec is scored across the whole market and not just the 6.25–7 m vans. The other two searches are subsets of it and are kept so the dashboard's search filter can still show them on their own.

An advert is flagged **worth a look** when it has at least `deals.minWantedSpecs` of the star spec, or is at least `deals.underpricedPercent` below similar adverts, or the seller looks motivated (see above), and it has no red flags. Those lead the notification.

Sellers describe kit in their own words, so the matcher looks for common phrasings ("air con", "cab air conditioning", "E&P levelling", "VB air suspension", "360 degree camera", "Alde wet heating", even "Aldi heating"). You can add or change patterns with a top-level `"specs"` list in the config, each entry being `{ "label": "...", "pattern": "<regular expression>" }`; the defaults are in `src/spec.js`.

Reading advert pages adds one request per new advert at about one a second, so a first run over a 2,000-advert search takes around 40 minutes; after that only new adverts are read. `details.maxFetchesPerRun` caps it and `details.delayMs` sets the pace. Descriptions are kept up to 6,000 characters; adverts stored with a shorter cut are re-read once (`details.refetchTruncated`, up to `details.maxRefetchesPerRun` a run) so kit listed at the end of a long dealer blurb is not missed.

Notifications lead with a **star spec hits** section across every search: new or reduced adverts with `deals.minWantedSpecs` or more star items, new private adverts with any star item, and re-listed vans.

On the dashboard you can filter by search, make, price, seller type and fit, star adverts into a shortlist, add notes, hide ones you have ruled out, and put up to three side by side with **Compare**. Every filter and view is in the page address, so a view can be bookmarked or sent to someone; **Share shortlist** makes a link that opens your starred adverts on any device. Stars, notes and hides otherwise live in your browser only. Each card has a price sparkline, and adverts that are new or have changed price since you last opened the page are marked. The page loads a light file of cards first (`docs/data/dashboard.json`) and fetches descriptions and chip evidence afterwards (`docs/data/dashboard-details.json`), so it paints quickly on a phone.

## Where it runs

**Current setup: a Claude Code routine.** A scheduled routine in the owner's Claude Code account wakes a runner session in the cloud four times on weekdays (07:24, 13:24, 18:24 and 21:24 UK time, following dealer hours) and three times at weekends (09:24, 14:24 and 21:24, following private sellers); it runs `node src/run.js`, pushes `docs/data` to this repo, and sends a phone summary. That cloud environment is not blocked by Autotrader. It can be paused or deleted from the Routines page in Claude Code.

**Autotrader blocks GitHub's own runners.** Every request from a GitHub-hosted runner gets HTTP 403, with or without a browser, so the scheduled job cannot run on `ubuntu-latest`. It needs a machine on an ordinary home or office connection. The cleanest way is a **self-hosted GitHub Actions runner**: the same workflow, schedule, commit-back and dashboard, just executed on your own machine.

1. Pick a machine that is on at the scheduled time: a Raspberry Pi, a NAS, an always-on PC or a small VPS (check a VPS provider is not blocked too).
2. Install Node 20 or newer on it.
3. In this repo go to **Settings → Actions → Runners → New self-hosted runner**, choose the OS and architecture, and paste the commands it shows into a terminal on that machine. Install it as a service when it offers to, so it survives reboots.
4. Once on that machine, in the runner's checkout of this repo (or anywhere), run `npx playwright install chromium` so the browser fallback is available.
5. In this repo go to **Settings → Secrets and variables → Actions → Variables** and add a variable `RUNNER_LABEL` with the value `self-hosted`.

From then on the daily job runs on your machine and everything else is unchanged. Until `RUNNER_LABEL` is set the schedule is skipped rather than failing every morning; **Run workflow** still runs on GitHub's machines so you can see the 403 for yourself. If the machine is off at 06:40 the run is skipped until the next day.

The fallback without a runner is a plain cron entry on that machine running `node src/run.js && git add docs/data && git commit -m "Daily search" && git push`, with the notification secrets exported in the environment.

## Setup

### 1. Searches

Edit `search.config.json`. The simplest way is to build the search on Autotrader, copy the URL from the address bar and paste it in:

```json
{
  "name": "Short name shown in notifications",
  "url": "https://www.autotrader.co.uk/motorhome-search?postcode=SW1A1AA&radius=100&make=Auto-Sleepers&price-to=40000&sort=datedesc"
}
```

Or describe it with criteria:

```json
{
  "name": "Auto-Sleepers 2015+ under £40k",
  "criteria": {
    "postcode": "SW1A 1AA",
    "radius": 100,
    "make": "Auto-Sleepers",
    "model": "Nuevo",
    "yearFrom": 2015,
    "yearTo": 2024,
    "priceFrom": 20000,
    "priceTo": 40000,
    "maxMileage": 60000,
    "fuel": "Diesel",
    "transmission": "Automatic",
    "sellerType": "trade",
    "berth": 2,
    "bodyType": "Van Conversion",
    "bedroomLayout": "Fixed double bed",
    "endLayout": "End Garage",
    "driverPosition": "Right Hand Drive",
    "keywords": "solar",
    "excludeWriteOffs": true,
    "sort": "datedesc"
  }
}
```

A criteria value can be a list to allow several, for example `"bodyType": ["Van Conversion", "Campervan"]`. Every criteria key is optional. Values must match what Autotrader offers in its own filters, for example:

| Key | Values |
| --- | --- |
| `radius` | miles: 1, 5, 10, 15, 20, 25, 30, 35, 40, 50, 75, 100, 150, 200, 300, 500 (omit for national) |
| `bodyType` | Motorhome, Coach Built, Campervan, Van Conversion, A Class, Low Profile, Overcab, … |
| `fuel` | Petrol, Diesel, Electric, Hybrid, Bi Fuel |
| `transmission` | Manual, Automatic, Semi-automatic |
| `sellerType` | trade, private |
| `berth` | 1 to 8 |
| `sort` | datedesc (newest first, recommended), price-asc, price-desc, distance, mileage, year-desc, year-asc |
| `keywords` | Autotrader's own keyword search, which also looks inside the advert description |

Two extra per-search options filter locally on the advert title, subtitle, make and model, matching whole words:

```json
"mustContain": ["lwb"],
"mustNotContain": ["spares or repair", "cat s", "cat n"]
```

`maxPages` (top level or per search) caps how many pages of 20 adverts are read. Keep searches narrow enough to fit; the dashboard flags a search that was cut short.

### 2. Notifications

Add these as **Settings → Secrets and variables → Actions → Repository secrets**. Set only the channel(s) you want. With none set, the dashboard still updates.

**Telegram** (free, easiest)

| Secret | Value |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Message [@BotFather](https://t.me/BotFather) on Telegram, send `/newbot`, follow the prompts, copy the token |
| `TELEGRAM_CHAT_ID` | Start a chat with your new bot and send it any message. Then open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and copy the `chat.id` number |

**Email** (Gmail with an app password, or any SMTP server)

| Secret | Value |
| --- | --- |
| `SMTP_USER` | your Gmail address |
| `SMTP_PASS` | a Gmail [app password](https://myaccount.google.com/apppasswords) (needs 2-step verification on the account) |
| `EMAIL_TO` | where to send (defaults to `SMTP_USER`) |
| `SMTP_HOST` / `SMTP_PORT` / `EMAIL_FROM` | optional; default to Gmail on port 465 |

### 3. Dashboard

**Settings → Pages → Build and deployment**: Source "Deploy from a branch", branch `master`, folder `/docs` (the root folder also works; it redirects to the dashboard). After the first run the page appears at `https://<your-username>.github.io/<repo-name>/`. Put that address in `dashboardUrl` in `search.config.json` so notifications link to it.

### 4. Refreshing from the dashboard

The search runs by itself every morning from the Claude Code routine (see "Where it runs") and the dashboard shows when the next run is due. To run it sooner, open Claude Code, go to **Routines**, open **Daily motorhome search** and press **Run**, or ask Claude in the project chat to refresh. The dashboard's **Refresh now** button explains this and then reloads the page by itself when new data arrives. Nothing on the page can start the job directly, and the GitHub **Run workflow** button only works once a self-hosted runner exists.

### 5. First run

**Actions → Daily motorhome search → Run workflow**. The first run records everything that currently matches, so you will get one large "new" notification; after that only changes are reported.

## Running locally

```bash
npm install
node src/run.js --dry-run     # fetch and print, without saving or notifying
node src/run.js               # full run; set TELEGRAM_* / SMTP_* in the environment to notify
node src/run.js --rescore     # recompute kit, value and deal flags from stored data, no requests
npm test
```

## When it breaks

The job's log (Actions tab) says which search failed and why. The likely causes, in order:

- **`Gateway HTTP 403`** on every search: Autotrader is blocking the machine's IP address. This is what GitHub-hosted runners get; see "Where it runs". On your own machine it means your IP has been blocked, usually temporarily: wait a day, and consider running less often.
- **`no searchResults.listings`** or **`Gateway error: Cannot query field …`**: Autotrader changed its search API. Compare the request the live site sends (browser dev tools → Network → `at-gateway`) with `LISTINGS_QUERY` in `src/autotrader.js`.
- **`Unknown criteria key`**: a typo in `search.config.json`.
