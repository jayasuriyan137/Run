# StrideCoach AI Training Hub

The **StrideCoach AI Training Hub**, adapted from the uploaded v1.2 dashboard for public static hosting. It includes a browser-local activity journal, coaching reviews, an editable weekly plan, run/walk calculators, nutrition notes, and JSON backups. No backend, API key, external font, analytics service, or production dependency is required.

The original dark dashboard design is retained. Personal history, race results, health notes, heart-rate zones and the personalized training program have been removed from the public source. Every new visitor starts with an empty journal and blank personal settings. The original records are kept separately in a local backup, outside this repository.

## Run locally

Use Node.js 22 or newer (validated with Node.js 24):

```sh
npm run dev
```

The development server uses port 4173. `PORT` can override it. Source files are `index.html` and `app.js`. The build embeds the script into a single HTML file; open `dist/index.html` directly for a standalone copy. A stable hosted address is preferable for consistent browser storage.

To create and serve the exact deployment artifact:

```sh
npm run build
npm run preview
```

The artifact is `dist/index.html`. Static hosts can serve it without Node.js. The included local server only serves public dashboard files, not Git metadata or backups.

## Validate

```sh
npm ci
npm run build
npm test
```

Local browser tests use `/usr/bin/chromium`, supplied by the cloud environment. In CI, Playwright installs its matching Chromium using `npx playwright install --with-deps chromium`. Browser tests use a separate server on port 4174.

Tests cover all eight sections, deep links and browser history, activity creation/editing/deletion, coaching notes, persistent heart-rate settings, training check-ins, nutrition notes, calculator output, backup export/import, and mobile/desktop layouts.

## Publish on GitHub Pages

1. Push this project to `main` in `jayasuriyan137/Run`.
2. Open the repository's **Settings → Pages** and choose **GitHub Actions** as the source.
3. In **Actions**, run **Test and publish dashboard**, or push a new commit to `main`.
4. Use the verified deployment URL shown by the successful `deploy` job. The expected project path is `/Run/`.

The workflow installs locked test dependencies, runs the browser tests against the built artifact, and publishes only `dist/`. Repository settings must permit Pages and GitHub Actions. On a private repository, Pages availability depends on the account plan; repository privacy does not imply that the website is private.

## Data and updates

There are no embedded workouts or personal health records in the public source. Entries and imported backups are saved only in that browser's local storage; they are not uploaded to GitHub and do not sync to other devices. Export JSON backups before moving to a new browser or address. Import them from **Data & privacy**. The public version uses its own storage key and never automatically reads data from older dashboard versions.

The dashboard is not connected to ChatGPT or an AI API. Screenshot analysis happens in chat; reviewed data and coaching notes can be added manually or imported as JSON. The training plan is an editable journal, with no personalized sessions preloaded.

Import accepts full legacy dashboard backups, a `workouts` array, a single `workout`, or an array of workouts. Matching IDs are merged, including their reviews. A full backup also restores nutrition notes, check-ins, supported goal/HR options and session notes after confirmation. Existing unrelated workouts are preserved. Export before merging if you need a recovery point. Legacy v1.2 backups were verified locally without uploading them to the website or GitHub.

No private backups, credential files, or screenshots should be committed to the repository. The original uploaded file is retained outside the checkout in the cloud workspace.
