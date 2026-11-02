# Brightspace Catalog — Chrome prototype

Catalog-first NYU Brightspace experiment. The extension needs no build step. Semester/course metadata stays in Chrome extension storage and a paired local companion. The Node service caches PDFs on demand, and a read-only desktop MCP server exposes both catalog metadata and cached documents. No hosted backend or analytics is used.

## Load in Chrome

1. Open `chrome://extensions` and enable Developer mode.
2. Click **Load unpacked** and select the `extension` folder in this project.
3. Sign into `https://brightspace.nyu.edu/d2l/home` in **Chrome** (the in-app browser session is separate).
4. Open one of your courses (any page in that course).
5. Open the extension popup and choose **Scan course outline**. Keep the popup open until it finishes. It requests the complete structured course outline in one call. No module expansion or animations are needed. Browse modules using collapsible folders; their open/closed state is saved per course. Search titles, module paths, and descriptions using the search box.
6. Click the **download icon** beside a supported file. Chrome saves it under `Downloads/Brightspace/<course>/<module path>/<original name> [topic ID].<extension>`. Duplicate downloads get unique filenames. Progress survives closing the popup. Chrome's download preferences may still prompt for a save location.
7. External links and assignments open in Brightspace. **Download open document** remains an experimental viewer-control fallback.

## What is implemented

- NYU-only Manifest V3 extension with a same-origin credentialed request in the source tab's isolated world.
- Complete ToC snapshots persisted by course and stable IDs in `chrome.storage.local`. Successful complete scans replace older entries; failed scans retain the previous catalog.
- Full hierarchy from recursive `Modules` and `Topics` arrays, ordered using `SortOrder`. Metadata includes plain-text descriptions, type, original resource URL, and modification time.
- Inline downloads of Brightspace-hosted PDF, Office, text, image and ZIP files using the ToC's actual resource URLs. Nested module folders are preserved. Download status uses Chrome's native download lifecycle.
- A background worker performs a HEAD preflight with the current session, rejects redirects/HTML/access errors, and starts Chrome's download manager. It continues when the popup closes. This requires the `downloads` permission; reload the extension after updating.
- External links, assignment attachments, HTML pages, locked items and unsupported file types do not receive inline buttons. Native Brightspace download-control activation remains available for the currently open Lessons document.
- Failed downloads have a **Details** control showing the failure stage and Chrome error code, MIME type, received byte count, and relative save path. Diagnostics stay in extension session storage; no session cookies or tokens are included.
- **Save as…** is available beside each supported file and explicitly opens Chrome's location picker using a short filename. This alternative saves wherever the user chooses rather than creating the catalog's course/module folders. Canceled downloads are labeled separately and never retried automatically. Whether a picker actually appears depends on the browser's implementation and policies; `USER_CANCELED` alone does not establish that the user canceled it.
- Download and Save as controls share a compact row. Hovering or keyboard-focusing either control softly highlights the matching resource title; reduced-motion preferences are respected.
- Text-only rendering of course data and no access to credentials or cookie values.

## Local PDF cache milestone

Requires Node.js 22 or newer and standalone Chrome. Run `npm ci` after cloning to install the pinned MCP SDK dependency. Existing Download and Save as controls continue to save ordinary user files; the managed cache is separate.

1. From the project directory, run `npm run companion` (`npm.cmd run companion` in PowerShell if script execution is restricted).
2. Leave that process running. It prints a 10-character pairing code.
3. Reload the extension at `chrome://extensions` (v0.4.0 adds localhost host access), then reopen it from your Brightspace course.
4. Expand **Local PDF cache**, enter the code, and choose **Connect**. It should show the cache's file count and storage usage.
5. Scan your course if needed, then click **Cache** beside a Brightspace-hosted PDF. Expect **Fetched and cached**.
6. Click **Cache ↻** on the same PDF. Expect **Cache hit — no download**. The companion serves the cached version without another Brightspace file request.

On Windows the default directory is `%LOCALAPPDATA%\BrightspaceContext\cache`, outside this OneDrive repository. On macOS/Linux it uses `XDG_CACHE_HOME` or `~/.cache/brightspace-context`. Override with `BRIGHTSPACE_CACHE_DIR` when needed. The terminal prints the resolved location. Closing the service stops cache access; restarting preserves pairing and cached files.

- The service binds only to `127.0.0.1:47653`. Pairing issues a token scoped to this extension origin; normal requests require that token. School passwords/cookies never go to the companion.
- Only selected PDFs are fetched. Files have a 50 MB limit; the cache has a 500 MiB budget including its document index. LRU eviction removes old cached PDFs. The small pairing configuration is outside that quota. No pinning is implemented yet.
- PDFs are stored by stable IDs, with original course/module paths in their metadata. Renames do not create filesystem path problems. A successful replacement keeps one cached version of a topic.
- Freshness follows the last modification date from the latest catalog scan. Rescan to discover instructor updates. When Brightspace supplies no date, hits expire after five minutes. Expired sessions block a miss; an existing fresh hit does not require a Brightspace file request.
- The cache verifies file type/signature before accepting data. It does not extract text, OCR, or search PDF contents. A Cache status describes the last request; eviction may remove that PDF later, and the next request will fetch it again.
- Local endpoints: `POST /v1/pair`, `GET /v1/status`, `POST /v1/cache/lookup`, ticketed `PUT /v1/cache/uploads/{id}`, and `GET /v1/cache/files/{id}`. Pair is the only endpoint that doesn't require a token, but it requires the code and an extension origin. No files are exposed to ordinary web origins.

## Semester catalog sync

1. Restart the companion after updating its code; pairing and cached files persist.
2. Reload the extension at `chrome://extensions` (v0.5.0).
3. In Chrome, open Brightspace **My Home**, select **2026 Fall** (or another semester), and wait for its course cards to load.
4. Open the extension and click **Sync selected semester**. The background worker captures this tab and semester's course IDs, then requests each course's complete nested outline sequentially. No course navigation, module expansion, or file downloads are needed. Keep Chrome and the source Brightspace tab open until completion. Progress is saved; reopening the popup shows the last progress. If Chrome/the worker stops mid-scan, retry the scan.
5. Expect `2026 Fall: 5/5 courses synced to companion` for the five courses observed in the current NYU account. The saved-course selector groups outlines by semester; each course retains the existing collapsible module browser and download/cache controls.
6. Restart the desktop MCP connection to discover `list_courses` and `search_catalog`. Ask it to find **Science of Happiness** and list its modules or locate a reading that has never been cached. It should return catalog metadata and explicitly report that the PDF is not cached.

Discovery reads the selected semester's rendered course cards through open shadow roots. It verifies that their count matches **View All Courses (N)**. A truncated/paginated list is rejected with instructions to load all courses; the prototype does not silently treat visible cards as the entire semester and does not yet automate course-list pagination. A selected term is required; the **All** tab is not a semester.

Successful course refreshes replace the previous outline, including deleted topics. Failed courses preserve any previous outline and report failure/staleness. Session expiry or throttling stops further school requests in that run. Completed course scans remain saved locally even if the companion is offline; **Send saved catalog** retries the local transfer without re-requesting Brightspace content.

The companion persists validated semester/course hierarchies in `catalog.json`, next to the PDF index. Catalog metadata has a separate 10 MiB cap (outside the 500 MiB PDF-cache quota), with up to 200 courses and 50,000 entries per semester snapshot. Local catalog endpoints are authenticated `PUT /v1/catalog/semesters` and `GET /v1/catalog`. Nothing is scheduled automatically; scans happen on request. External resources remain links and are not fetched.

## Desktop MCP handoff

This milestone targets local work in the desktop app on the same computer as the cache. It is not a web-distributed ChatGPT plugin and does not make localhost files accessible from hosted ChatGPT.

1. Keep the paired companion running and cache at least one PDF in Chrome.
2. Register the STDIO server once with an absolute path, for example in PowerShell:

   ```powershell
   codex mcp add brightspace-context -- node "$((Resolve-Path .\mcp\start.js).Path)"
   ```

   Alternatively, in desktop Settings → MCP servers add a STDIO server named `brightspace-context`, command `node`, with the absolute `mcp/start.js` path as its argument. The server uses the same default cache directory as the companion; custom directories use `BRIGHTSPACE_CACHE_DIR` for both processes.
3. Restart the MCP connection/app as required, then open a fresh local chat. Use `/mcp` to check that `brightspace-context` is connected.
4. Ask: **Use brightspace-context to find a cached course PDF. Read the actual PDF using the desktop file tools, then answer one question about its contents. Don't answer from the title or metadata.**

Tools:

- `list_cached_documents`: paginated metadata search by title, course and module path. Only cached PDFs are visible; it does not search PDF text or the extension's entire course catalog.
- `get_cached_document`: integrity-checks the selected file and returns a verified absolute local path, source reference, and `brightspace-cache://documents/{id}` resource link. It accepts only IDs from the cache, not arbitrary filesystem paths.
- `list_courses`: paginated synced semesters/courses, outline freshness and per-course scan errors.
- `search_catalog`: paginated metadata search across synced semesters/courses, including uncached resources. Pass `courseId` without a query and follow pagination to browse a whole outline; `parentKey` and `modulePath` preserve hierarchy. Cache presence is a hint until `get_cached_document` verifies the file. Uncached-file fetching is not implemented yet.
- Standard MCP `resources/list` and `resources/read` expose cached PDFs. Embedded binary reads are limited to 10 MiB; larger PDFs use the verified local path and the desktop host's PDF reader.

**A resource link is not an automatic ChatGPT attachment.** The host must actually read the PDF using its local file/PDF tools, or support consuming binary PDF resources. The companion and MCP server perform no OCR or PDF text extraction. Document content is untrusted source material, not tool instructions. Pairing credentials remain internal and never appear in tool results.

Run `npm run mcp:verify` (optionally `npm run mcp:verify -- syllabus`) to launch the real MCP process and check list → get → resource-read against a cached file. The checker verifies binary equality without printing PDF bytes or credentials. This validates transport; it does not claim that ChatGPT can answer a question without reading the file.

The transport checker was verified against a real cached PDF, and a page from the returned path was rendered and read with the desktop PDF tools. The user also confirmed successful retrieval and reading in another desktop chat. Semester sync still needs the live Chrome acceptance check described above.

## Prototype boundaries

The documented GET `/d2l/api/le/1.82/{courseId}/content/toc` was verified through a signed-in NYU browser session: a test course returned all 9 modules and 23 topics in a single JSON response, including collapsed modules. No app registration or API token was supplied for that browser request. Version 1.82 is pinned to this verified NYU route; other tenants may differ. The user confirmed inline downloads work in standalone Chrome. The same downloads were canceled with `USER_CANCELED` in the ChatGPT built-in browser after a successful PDF preflight; use standalone Chrome for validation. Native viewer-control fallback activation is a request, not proof of completion.

Scanning does not alter the website's navigation state. "Full course outline" refers to the server-returned outline for this user; it does not include inaccessible content, contents of external links, assignment attachments, or text inside unopened files. Hidden branches are omitted. Ordinary permission checks remain in force; no date-restriction override parameters are used. External URLs are cataloged without being fetched.

The older DOM inspector and expansion scripts remain as experimental diagnostic code and are not invoked by the scan button. A failed JSON request reports an error instead of silently falling back to UI automation.

Each popup captures its source tab when opened. Single-course scans validate that course again before saving. Semester scans capture the selected semester's explicit course list; changing focus never redirects requests to another tab. Saved outlines can be selected independently of the currently open course. The source tab is shown in the popup. To scan from another tab, reopen the extension there.

No scheduled catalog refresh, archive extraction, PDF text extraction/OCR, automatic retrieval of uncached documents through MCP, or hosted ChatGPT plugin is included. Opening a topic can affect Brightspace's viewed/completion tracking, just as manual navigation does.

## Verify

Run `npm test` and `npm run check` (or `npm.cmd` in PowerShell if script execution is restricted).

Manual acceptance: scan with every website module collapsed and verify the full hierarchy appears without changing the page; check nested modules and catalog search; rescan and check no duplicate IDs; close/reopen popup and confirm persistence; request a PDF download and check actual bytes; test with a signed-out browser and an unsupported page. Do not count a login HTML page as a downloaded document. Use a separate browser profile to test signed-out behavior without disrupting your usual session.

Automated integration tests exercise the actual localhost HTTP service with a synthetic PDF source: pairing and unauthorized origins, first fetch, second-request hit, byte equality, restart persistence, changed versions, PDF rejection, size limits, and LRU eviction. The user also confirmed the signed-in Chrome-to-NYU-to-companion flow shows **Fetched and cached** followed by **Cache hit — no download**.

Next: verify the live semester catalog in Chrome and a fresh desktop chat, then connect queued requests for uncached documents. Optional text-only indexing can follow; OCR is deferred.
