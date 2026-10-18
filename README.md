# WGU Class Launchpad

One page for the current class: the next step's imprint warmup and a Start button, synced from the class's Steps database in Notion.

## How it works

- `classes/<code>.json` holds one class: its Steps data source in Notion, task targets, and whether it is the active class.
- `scripts/sync.mjs` reads every class from Notion and writes `site/data/`. It runs in GitHub Actions with the `NOTION_TOKEN` secret, so the Notion key never reaches the repo or the page.
- `.github/workflows/sync.yml` runs the sync and publishes `site/` to GitHub Pages every 30 minutes from 7 AM to midnight Eastern, on every push to main, and on demand (Actions, Sync from Notion and publish, Run workflow).
- `site/index.html` is the whole app: plain HTML, CSS and JavaScript, no build step. It shows the active class; add `#d522` style hashes to open another class.

## Add the next class

1. Build its Steps database in Notion with the same properties: Step, Order, Reviewed, Submission, Due, Date Completed, Warmup, Check, Answer, Go To, Also Open.
2. Connect the Notion integration to the class page (••• menu, Connections).
3. Copy `classes/d522.json` to a new file, fill in the new IDs and dates, set `"active": true` on it and `false` on the old one, and push.

## Privacy

The repo is private. The published page is still reachable by anyone who has its link (GitHub only restricts Pages access on Enterprise plans), so it shows class steps and warmups only, never keys.

## Tests

- `NOTION_MOCK=tests/mock-notion.json node scripts/sync.mjs` runs the sync against a saved Notion reply.
- `python3 tests/test_page.py` checks the page in a phone-size browser, light and dark (needs Playwright).
