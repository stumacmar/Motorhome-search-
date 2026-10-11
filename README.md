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

- **Kit.** Each advert is matched against a list of equipment (air conditioning, self-levelling, rear air suspension, 360° camera, reversing camera, automatic, solar, lithium, inverter, cruise control, tow bar, awning, satellite TV, full service history). The ones you care about go in `deals.wantedSpecs` in `search.config.json` and are highlighted.
- **Price against similar adverts.** Each advert is compared with the median price of live adverts of the same make and model within two years of its age (falling back to the same make within one year when there are not enough). "−14% vs 7 similar" means it is 14% cheaper than the median of seven comparable adverts. The more adverts your searches cover, the better these comparisons get, so a broad search with a high `maxPages` helps here even if you only want to be told about a narrow one.

An advert is flagged **worth a look** when it has at least `deals.minWantedSpecs` of your wanted kit, or is at least `deals.underpricedPercent` below similar adverts. Those lead the notification.

Sellers describe kit in their own words, so the matcher looks for common phrasings ("air con", "cab air conditioning", "E&P levelling", "VB air suspension", "360 degree camera"). You can add or change patterns with a top-level `"specs"` list in the config, each entry being `{ "label": "...", "pattern": "<regular expression>" }`; the defaults are in `src/spec.js`.

Reading advert pages adds one request per new advert, so `details.maxFetchesPerRun` caps it (default 80); the rest are read on later runs.

## Where it runs

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

Two extra per-search options filter locally on the advert title and subtitle only (the description is not downloaded):

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

### 4. First run

**Actions → Daily motorhome search → Run workflow**. The first run records everything that currently matches, so you will get one large "new" notification; after that only changes are reported.

## Running locally

```bash
npm install
node src/run.js --dry-run     # fetch and print, without saving or notifying
node src/run.js               # full run; set TELEGRAM_* / SMTP_* in the environment to notify
npm test
```

## When it breaks

The job's log (Actions tab) says which search failed and why. The likely causes, in order:

- **`Gateway HTTP 403`** on every search: Autotrader is blocking the machine's IP address. This is what GitHub-hosted runners get; see "Where it runs". On your own machine it means your IP has been blocked, usually temporarily: wait a day, and consider running less often.
- **`no searchResults.listings`** or **`Gateway error: Cannot query field …`**: Autotrader changed its search API. Compare the request the live site sends (browser dev tools → Network → `at-gateway`) with `LISTINGS_QUERY` in `src/autotrader.js`.
- **`Unknown criteria key`**: a typo in `search.config.json`.
