# Motorhome search

A small robot that checks Autotrader UK for motorhomes every morning, remembers what it has seen, and tells you about adverts that are **new** or have **dropped in price**. A dashboard on GitHub Pages lists every matched advert with its price history.

It runs on GitHub Actions, so nothing needs to be switched on at home.

> **Caveats.** Autotrader has no public API, and its terms of service do not allow automated reading of the site. This project reads the same JSON feed the search page itself uses, which is far more stable than scraping HTML, but it will still break from time to time when Autotrader changes things, and Autotrader may block it. Autotrader's own "save this search" email alert is the officially supported alternative.

## How it works

1. `search.config.json` lists your searches. Each one is either a pasted Autotrader URL or a block of criteria.
2. `.github/workflows/daily.yml` runs `src/run.js` once a day (and whenever you press **Run workflow**).
3. The job fetches every search, compares the results with `docs/data/listings.json`, and commits the updated file back to the repo.
4. If anything is new, it sends a Telegram message and/or an email. If nothing changed, it stays quiet.
5. `docs/index.html` is the dashboard. GitHub Pages serves it from the `docs/` folder.

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

Every criteria key is optional. Values must match what Autotrader offers in its own filters, for example:

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

**Settings → Pages → Build and deployment**: Source "Deploy from a branch", branch `master`, folder `/docs`. After the first run the page appears at `https://<your-username>.github.io/<repo-name>/`. Put that address in `dashboardUrl` in `search.config.json` so notifications link to it.

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

- **`Gateway HTTP 403`** on every search: Autotrader is blocking GitHub's IP addresses. The browser fallback runs automatically; if that fails too, the job needs to run from somewhere else (a Raspberry Pi with the same `node src/run.js` and a cron entry works).
- **`no searchResults.listings`** or **`Gateway error: Cannot query field …`**: Autotrader changed its search API. Compare the request the live site sends (browser dev tools → Network → `at-gateway`) with `LISTINGS_QUERY` in `src/autotrader.js`.
- **`Unknown criteria key`**: a typo in `search.config.json`.
