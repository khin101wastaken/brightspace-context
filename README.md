# Brightspace Catalog — Chrome prototype

Catalog-first NYU Brightspace experiment. No dependencies or build step. Files remain local in Chrome extension storage; there is no backend, analytics, or MCP connection yet.

## Load in Chrome

1. Open `chrome://extensions` and enable Developer mode.
2. Click **Load unpacked** and select the `extension` folder in this project.
3. Sign into `https://brightspace.nyu.edu/d2l/home` in **Chrome** (the in-app browser session is separate).
4. Open one of your courses (any page in that course).
5. Open the extension popup and choose **Scan course outline**. Keep the popup open until it finishes. It requests the complete structured course outline in one call. No module expansion or animations are needed. Browse modules using collapsible folders; their open/closed state is saved per course. Search titles, module paths, and descriptions using the search box.
6. Open an individual file in Brightspace, then choose **Download open document**. Check Chrome's Downloads to verify success.

## What is implemented

- NYU-only Manifest V3 extension with a same-origin credentialed request in the source tab's isolated world.
- Complete ToC snapshots persisted by course and stable IDs in `chrome.storage.local`. Successful complete scans replace older entries; failed scans retain the previous catalog.
- Full hierarchy from recursive `Modules` and `Topics` arrays, ordered using `SortOrder`. Metadata includes plain-text descriptions, type, original resource URL, and modification time.
- Native Brightspace download-control activation for the currently open Lessons document. No fabricated file endpoints.
- Text-only rendering of course data and no access to credentials or cookie values.

## Prototype boundaries

The documented GET `/d2l/api/le/1.82/{courseId}/content/toc` was verified through a signed-in NYU browser session: a test course returned all 9 modules and 23 topics in a single JSON response, including collapsed modules. No app registration or API token was supplied for that browser request. Version 1.82 is pinned to this verified NYU route; other tenants may differ. The updated extension's fetch path still needs verification in Chrome. Download activation is a request, not proof of completion.

Scanning does not alter the website's navigation state. "Full course outline" refers to the server-returned outline for this user; it does not include inaccessible content, contents of external links, assignment attachments, or text inside unopened files. Hidden branches are omitted. Ordinary permission checks remain in force; no date-restriction override parameters are used. External URLs are cataloged without being fetched.

The older DOM inspector and expansion scripts remain as experimental diagnostic code and are not invoked by the scan button. A failed JSON request reports an error instead of silently falling back to UI automation.

Each popup captures one source tab and course when opened. Scan, download, and saved-catalog reads use that target; changing focus does not redirect a running action. Navigation to another course or sign-in aborts saving. The source tab is shown in the popup. To work with another tab, reopen the extension there.

No background syncing, archive extraction, content cache, OCR, local companion, or ChatGPT integration is included. Opening a topic can affect Brightspace's viewed/completion tracking, just as manual navigation does.

## Verify

Run `npm test` and `npm run check` (or `npm.cmd` in PowerShell if script execution is restricted).

Manual acceptance: scan with every website module collapsed and verify the full hierarchy appears without changing the page; check nested modules and catalog search; rescan and check no duplicate IDs; close/reopen popup and confirm persistence; request a PDF download and check actual bytes; test with a signed-out browser and an unsupported page. Do not count a login HTML page as a downloaded document. Use a separate browser profile to test signed-out behavior without disrupting your usual session.

Next: verify the session-based ToC request in Chrome, verify file download and authentication handling, then add a bounded local companion cache and read-only MCP retrieval tools.
