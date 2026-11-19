# Privacy and security

Greenhouse handles protected health information (PHI): client names, incidents, injuries, behavioral events and service enrollment. This page describes how it's protected and what isn't covered yet. It isn't a HIPAA compliance certification. EVC's IT and compliance staff should review it.

## What is protected, and how

| Risk | Protection |
|---|---|
| Data leaving the laptop | No internet use at all: no cloud, analytics, telemetry, updates or fonts from the web. Links open in the normal browser, and the app window can't navigate away from the app. |
| A website or another program reading the data | The local API listens on `127.0.0.1` only, on a random port, and **every** data request must carry a 64-character secret generated fresh at each launch and known only to the app window. There's no wildcard CORS, and the Host header is checked, which blocks DNS-rebinding tricks. Tested: a request without the token gets `401`. |
| The app window being abused | The window is sandboxed and context-isolated with no Node.js access. The preload script exposes only the API address, the token and the platform name. All permission requests (camera, microphone, location …) are denied. |
| Data loss or corruption | Atomic saves (temp file, then rename). Automatic backup before every import, undo and clear; the last 10 are kept. Every import is one transaction, so either all of it is saved or none. |
| Accidentally mixing demo and real data | Demo data refuses to load when real data exists. A "Demo data" badge shows whenever demo data is loaded. |
| Names in screens and exports | The People screen and the "Individual" tab of the incident workbook carry visible "contains names" warnings. |

## Not covered yet

| Gap | Recommendation |
|---|---|
| **Encryption at rest.** The database file isn't encrypted by the app. | Rely on Windows **BitLocker** (device encryption). Ask IT to confirm it's on for this laptop. App-level encryption (e.g. a passphrase at launch) is a possible future feature. |
| **No user accounts or roles.** Anyone who can log into the Windows account can open the app and see everything. | Keep the laptop locked and the Windows account private. Roles (e.g. a dashboard-only view without names, HR-only pay data) need a decision from EVC; see the open questions. |
| **Exports and backups are ordinary files.** Excel reports and `backups\*.db` contain PHI. | Save reports only to approved locations. Don't email the database or backups. |
| **No audit log** of who imported or viewed what. | Possible future feature if required. |
| **Unsigned app.** Windows can't verify the publisher. | Code signing (see limitations). Publish the SHA-256 checksum so IT can verify the file. |

## Rules for the project team

1. **Never commit real data.** That means real exports, real Word rosters, the database, backups, or screenshots of real data. `.gitignore` excludes `*.db`, `db/backups/`, `imports/`, `*.real.xlsx`, `*.real.docx` and `demo-data/from-export/`.
2. **De-identified isn't anonymous.** A file with names replaced by tokens ("Member 104") still holds dates, sites and free-text narratives that can identify people. Treat it as sensitive: don't commit it or share it outside the team.
3. **Use fictitious data for development and demos.** Use `npm run demo:files` and the files in `demo-data/`. Every name and site in them is invented.
4. **Learning file structure from real files** is done on Kristen's laptop with EVC's approved, HIPAA-compliant ChatGPT workspace, using prompts that return structure and counts only ([`chatgpt-prompt.md`](chatgpt-prompt.md)). A person reviews every output before it's shared.
5. `scripts/make-roster-from-export.js` refuses to run unless the export's names already look like tokens, and writes to a git-ignored folder.
