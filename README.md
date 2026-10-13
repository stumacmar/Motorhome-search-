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

- **Kit.** Each advert is matched against a list of equipment: habitation air conditioning (a Truma or Dometic roof unit, as opposed to cab air con, which is listed separately and worth nothing), self-levelling, rear air suspension, 360° camera, reversing camera, automatic, solar, lithium, inverter, diesel heater, cruise control, tow bar, awning, satellite TV, full service history. Each item carries a rough fitted value in pounds. The ones you care about go in `deals.wantedSpecs` in `search.config.json` and are highlighted.
- **Price against similar adverts, net of kit.** The kit values are subtracted from every price, then each advert is compared with similar live adverts: same make and model within two years of its age; failing that the same chassis, body type and berth count; failing that the same make within one year. With eight or more comparables the expected price is adjusted for age and mileage by a small regression, otherwise the median is used. "−14% vs 12 similar, £6,000 of kit" means that after allowing for its kit the van is 14% cheaper than twelve comparable adverts predict. The more adverts your searches cover, the better this gets, which is why the example search reads the whole market.
- **Days on market, price drops and desperation.** Autotrader advert ids start with the listing date, so the dashboard shows how long each advert has been up even on the first run, plus how many times and how far its price has dropped since the job started watching it. These combine into a desperation score out of 100: time unsold (up to 50, from two weeks to six months), number of drops (10 each, up to 20), total cut (up to 20, full marks at 10% off) and 10 for a private seller. A seller is flagged **motivated** when the score reaches `deals.motivatedScore` (default 40, roughly five months unsold with nothing else, or two months plus a couple of cuts) and the advert joins the worth-a-look list at `deals.dealScore` (default 50). One caveat: for dealers that feed Autotrader automatically the advert can be older than the vehicle, so treat very long "listed" figures on new stock with suspicion.
- **Red flags.** Left-hand drive, imported, damp mentioned, write-off category, spares or repair, four or more owners, a failed history check. Shown on the card and they keep an advert out of the worth-a-look list.
- **Unconverted vans.** Autotrader's motorhome channel contains plain panel vans. Anything whose page says fewer than `details.excludeIfBerthBelow` berths is hidden.
- **Length.** Autotrader's own length filter only catches adverts where the seller filled the length in, which is a minority of van conversions. So the job also works out length itself from the spec sheet, a figure stated in the advert, or the base vehicle and wheelbase code (Ducato L4 is 6.36 m, Sprinter LWB 6.97 m, a VW Transporter about 5 m) and hides anything outside `length.minMetres` to `length.maxMetres`. Adverts whose length cannot be worked out stay visible and are marked "length unknown"; set `length.hideUnknown` to hide them too.

An advert is flagged **worth a look** when it has at least `deals.minWantedSpecs` of your wanted kit, or is at least `deals.underpricedPercent` below similar adverts, or the seller looks motivated (see above), and it has no red flags. Those lead the notification.

Sellers describe kit in their own words, so the matcher looks for common phrasings ("air con", "cab air conditioning", "E&P levelling", "VB air suspension", "360 degree camera"). You can add or change patterns with a top-level `"specs"` list in the config, each entry being `{ "label": "...", "pattern": "<regular expression>" }`; the defaults are in `src/spec.js`.

Reading advert pages adds one request per new advert at about one a second, so a first run over a 2,000-advert search takes around 40 minutes; after that only new adverts are read. `details.maxFetchesPerRun` caps it and `details.delayMs` sets the pace.

On the dashboard you can star adverts into a shortlist, add notes and hide ones you have ruled out. Those live in your browser only, so they do not follow you between phone and laptop.

## Where it runs

**Current setup: a Claude Code routine.** A scheduled routine in the owner's Claude Code account wakes a runner session in the cloud every morning at 06:54 UK time; it runs `node src/run.js`, pushes `docs/data` to this repo, and sends a phone summary. That cloud environment is not blocked by Autotrader. It can be paused or deleted from the Routines page in Claude Code.

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
