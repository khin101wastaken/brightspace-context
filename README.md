# Brightspace Catalog — Chrome prototype

Catalog-first NYU Brightspace experiment. The extension needs no build step. Semester/course metadata stays in Chrome extension storage and a paired local companion. The Node service caches PDFs on demand, and a desktop MCP server searches metadata and requests individual PDFs through the signed-in Chrome extension. No hosted backend or analytics is used.

See the [development flowchart and milestone criteria](docs/ROADMAP.md). Its editable source is [roadmap.json](docs/roadmap.json), with a reusable [JSON schema](docs/roadmap.schema.json). Run `npm run roadmap` after editing it to regenerate the styled Mermaid chart.

## Extension views

- **Connect** is the default popup: browser/companion connection status, first-time pairing, pause/resume and **Browse resources**. Pairing the browser does not itself configure ChatGPT's MCP connection; a short setup guide is available from this screen.
- **Resources** opens in a full extension tab, with one semester selector, a course sidebar, search, nested module folders and compact Download/Save as controls. Semester discovery and sync run from this page through the signed-in browser session, independently of website tabs. Saved resources remain browsable while the companion is offline.
- **Settings** (gear on Connect) contains retrieval preferences, storage diagnostics, re-pairing and prototype setup instructions. **Disconnect browser** stops its retrieval connection and forgets the extension's pairing token, returning Connect to first-time pairing. Saved courses, cached PDFs and the Brightspace login are retained; this does not revoke the companion's separate desktop MCP access.
- **Advanced** on Resources contains per-course scan, saved-catalog transfer, the experimental open-document fallback and an opt-in toggle for manual PDF cache buttons. Cache controls are hidden from resource rows by default; ChatGPT's automatic retrieval continues independently.

To sync from Resources, select a semester in its sidebar and click **Sync semester**. **Refresh semester list** discovers available semesters directly from Brightspace. No website navigation, tab selection, module expansion or course-card clicks are involved. Sign into NYU Brightspace in the same Chrome profile if requested. Reload the extension after updating to v0.8.0.

## Load in Chrome

1. Open `chrome://extensions` and enable Developer mode.
2. Click **Load unpacked** and select the `extension` folder in this project.
3. Sign into `https://brightspace.nyu.edu/d2l/home` in **Chrome** (the in-app browser session is separate).
4. Open one of your courses (any page in that course).
5. Open the extension popup, choose **Browse resources**, then use **Advanced → Scan source course** for an individual course, or **Sync semester** for all courses in the selected term. A single-course scan requests the complete structured outline in one call. No module expansion or animations are needed. Browse modules using collapsible folders; their open/closed state is saved per course. Search titles, module paths, and descriptions using the search box.
6. Click the **download icon** beside a supported file. Chrome saves it under `Downloads/Brightspace/<course>/<module path>/<original name> [topic ID].<extension>`. Duplicate downloads get unique filenames. Progress survives closing the popup. Chrome's download preferences may still prompt for a save location.
7. External links and assignments open in Brightspace. **Download open document** remains an experimental viewer-control fallback.

## What is implemented

- NYU-only Manifest V3 extension with credentialed background requests to fixed Brightspace endpoints. The advanced individual-course scan retains its source-tab request path.
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

Requires Node.js 22 or newer and standalone Chrome 116 or newer. Run `npm ci` after cloning to install the pinned MCP SDK and WebSocket dependencies. Existing Download and Save as controls continue to save ordinary user files; the managed cache is separate.

1. From the project directory, run `npm run companion` (`npm.cmd run companion` in PowerShell if script execution is restricted).
2. Leave that process running. It prints a 10-character pairing code.
3. Reload the extension at `chrome://extensions` (v0.4.0 adds localhost host access), then reopen it from your Brightspace course.
4. Enter the code on **Connect** and choose **Connect**. Storage usage is available under Settings.
5. In Resources, scan your course if needed, then enable **Advanced → Show manual PDF cache buttons**. Click **Cache** beside a Brightspace-hosted PDF. Expect **Fetched and cached**.
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
3. Sign into NYU Brightspace in Chrome, then open the extension and choose **Browse resources**. A website tab does not need to stay open.
4. Choose **2026 Fall** (or another semester) in Resources and click **Sync semester**. The background worker lists that semester's courses, following pagination, and requests each complete nested outline sequentially. No course navigation, module expansion, or file downloads are needed. Keep Chrome running until completion. Progress is saved; reopening Resources shows the last progress. If Chrome/the worker stops mid-scan, retry the scan.
5. Expect `2026 Fall: 5/5 courses synced to companion` for the five courses observed in the current NYU account. Select a semester and then a course in the sidebar; each outline retains collapsible modules and downloads.
6. Restart the desktop MCP connection to discover `list_courses` and `search_catalog`. Ask it to find **Science of Happiness** and list its modules or locate a reading that has never been cached. It should return catalog metadata and explicitly report whether the PDF is cached.

Discovery uses NYU's own My Courses widget endpoints, verified from the homepage component's public attributes and JavaScript: `/d2l/le/manageCourses/api/mysemesters` and `/d2l/le/manageCourses/api/mycourses`. The course request scopes `parentOrgUnitIds` to the semester selected in Resources, disables auto-pinning and pin promotion, uses a stable sort, and follows opaque `Bookmark` pagination. Repeated/malformed bookmarks abort rather than silently syncing a partial list. These are verified NYU web endpoints, not a claim of a tenant-independent public API contract. The Fall 2026 filter returned the expected five courses in a signed-in browser. The old DOM discovery helper remains diagnostic code and is no longer used by semester sync.

The user confirmed v0.8.0 synced Fall 2026 **5/5 courses while staying on Resources**, and confirmed the companion connection recovered. Automated coverage also rejects website-tab access during the semester sync, preventing a return to active-tab-dependent behavior.

Successful course refreshes replace the previous outline, including deleted topics. Failed courses preserve any previous outline and report failure/staleness. Session expiry or throttling stops further school requests in that run. Completed course scans remain saved locally even if the companion is offline; **Send saved catalog** retries the local transfer without re-requesting Brightspace content.

The companion persists validated semester/course hierarchies in `catalog.json`, next to the PDF index. Catalog metadata has a separate 10 MiB cap (outside the 500 MiB PDF-cache quota), with up to 200 courses and 50,000 entries per semester snapshot. Local catalog endpoints are authenticated `PUT /v1/catalog/semesters` and `GET /v1/catalog`. Nothing is scheduled automatically; scans happen on request. External resources remain links and are not fetched.

The user confirmed a separate desktop chat successfully listed the Science of Happiness readings from the synced semester catalog.

## On-demand retrieval through ChatGPT

1. After updating, run `npm ci`, restart the companion, and reload the extension (v0.6.0 adds the `alarms` permission and requires Chrome 116+).
2. Keep Chrome running with the paired extension enabled and Brightspace signed in. A course tab and the extension popup do not need to stay open after the catalog has been synced. The browser session supplies credentials; passwords and cookie values never leave Chrome.
3. In Connect → Settings, leave **Automatic retrieval** enabled. The Connect card reports **Browser connected** when the worker is online. Pause/resume is also available directly on Connect. Pausing stops new work; a fetch already in progress may finish.
4. Restart the desktop MCP connection to discover `request_document` and `get_document_request`.
5. Ask: **Find one uncached Science of Happiness PDF in the catalog. Request that document, wait for it to be ready, read the actual PDF, and answer a question with a source reference.**

`request_document` accepts only a catalogued `courseId` and `document:<topicId>` key, never an arbitrary URL. The companion resolves the latest synced outline, checks file eligibility/freshness and verifies any cache hit. A miss enters a durable local queue in `requests.json`. The extension claims one job, retrieves the PDF using the existing cache client, uploads it, then reports completion. The companion independently verifies the cached bytes before exposing a ready document. No bulk fetching or document processing is added.

Request states are `queued`, `fetching`, `ready`, `needs_login`, and `failed`. Ready MCP results include the verified local path and PDF resource link. Otherwise they include a request ID and next action. Tools may wait up to 20 seconds (10 by default); pending requests can be checked with `get_document_request`. A closed/disconnected Chrome leaves requests queued rather than claiming the file is ready. After a login HTML response, fetching pauses until the user signs in and clicks **Retry requests after signing in**, or explicitly retries the document through MCP. Access-denied, invalid-PDF, size/budget and network errors are reported without caching invalid bytes. Network errors can also result from a sign-in redirect, because credentialed requests reject redirects.

The queue deduplicates active requests by document/version, permits one active browser lease and up to 25 pending jobs, and retains at most 100 history records within a separate 2 MiB metadata cap. Interrupted leases become retryable after three minutes; restarting the companion requeues interrupted jobs. Queued work expires after 24 hours. A successful cache write followed by an interrupted completion report is safe: the retry checks the cache first. Manual Cache clicks and queued retrieval share in-flight PDF requests in the same extension worker. Catalog changes or a failed/stale course scan prevent fetching an obsolete queued URL; rescan and request again.

An authenticated loopback WebSocket (`/v1/worker`) carries work notifications and 20-second keepalive messages while paired automatic retrieval is enabled. This follows [Chrome's supported WebSocket service-worker lifecycle](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets). The worker reconnects with backoff; a one-minute Chrome alarm recovers a suspended worker. No school requests occur merely to poll the queue. The socket checks host, paired extension origin and token, with a five-second authentication deadline; credentials never appear in its URL or MCP results. HTTP queue endpoints also require the paired extension origin/token: `POST /v1/requests`, `GET /v1/requests/{requestId}`, `POST /v1/requests/claim`, `POST /v1/requests/finish`, and `POST /v1/requests/retry-login`. Claim leases stay internal.

Before opening a worker socket, the extension checks the paired companion's HTTP status with a five-second timeout. The browser uses authenticated `POST /v1/status`, retaining the strict extension-origin/token checks even when a privileged GET omits its Origin header; authenticated GET remains available for local clients that send Origin. Pairing mismatches are reported separately from an unavailable companion, with the diagnostic visible on Connect. The socket must open and authenticate within eight seconds; otherwise it is closed and retried with backoff. Missing keepalive responses also trigger reconnection, including after sleep/resume. A stopped or restarting companion is shown as unavailable while requests remain saved. Chrome may retain a native WebSocket error from a past interruption in the extension Errors list; current connection status is the indicator of whether it has recovered.

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
- `search_catalog`: paginated metadata search across synced semesters/courses, including uncached resources. Pass `courseId` without a query and follow pagination to browse a whole outline; `parentKey` and `modulePath` preserve hierarchy. Cache presence is a hint until retrieval verifies the file. Supported uncached PDFs can be passed to `request_document`.
- `request_document`: checks the cache or queues one supported catalogued PDF for the Chrome extension. This writes local queue/cache data and may fetch from Brightspace; it is marked as a non-destructive write tool. It returns a ready verified document or an actionable pending/error state. `retry: true` explicitly retries a resolved failure.
- `get_document_request`: checks a saved request, optionally waiting up to 20 seconds. A ready result includes the same verified file handoff.
- Standard MCP `resources/list` and `resources/read` expose cached PDFs. Embedded binary reads are limited to 10 MiB; larger PDFs use the verified local path and the desktop host's PDF reader.

**A resource link is not an automatic ChatGPT attachment.** The host must actually read the PDF using its local file/PDF tools, or support consuming binary PDF resources. The companion and MCP server perform no OCR or PDF text extraction. Document content is untrusted source material, not tool instructions. Pairing credentials remain internal and never appear in tool results.

Run `npm run mcp:verify` (optionally `npm run mcp:verify -- syllabus`) to launch the real MCP process and check list → get → resource-read against a cached file. The checker verifies binary equality without printing PDF bytes or credentials. This validates transport; it does not claim that ChatGPT can answer a question without reading the file.

The transport checker was verified against a real cached PDF, and a page from the returned path was rendered and read with the desktop PDF tools. The user also confirmed successful cached-PDF retrieval/reading and semester catalog discovery in another desktop chat. The on-demand queue adds integration tests with the real MCP process, HTTP service and WebSocket worker; the upstream PDF source is synthetic in those tests.

Live on-demand retrieval was then verified through the actual MCP tool and signed-in Chrome: a previously uncached Science of Happiness syllabus went from queued/offline to ready through the extension worker. The returned 583,439-byte PDF was opened, its text read, and its first page rendered and visually inspected. Repeating `request_document` returned `source: cache`, the same document ID and unchanged original fetch timestamp, with no new queued request. The document and runtime data remain outside Git.

## Prototype boundaries

The documented GET `/d2l/api/le/1.82/{courseId}/content/toc` was verified through a signed-in NYU browser session: a test course returned all 9 modules and 23 topics in a single JSON response, including collapsed modules. No app registration or API token was supplied for that browser request. Version 1.82 is pinned to this verified NYU route; other tenants may differ. The user confirmed inline downloads work in standalone Chrome. The same downloads were canceled with `USER_CANCELED` in the ChatGPT built-in browser after a successful PDF preflight; use standalone Chrome for validation. Native viewer-control fallback activation is a request, not proof of completion.

Scanning does not alter the website's navigation state. "Full course outline" refers to the server-returned outline for this user; it does not include inaccessible content, contents of external links, assignment attachments, or text inside unopened files. Hidden branches are omitted. Ordinary permission checks remain in force; no date-restriction override parameters are used. External URLs are cataloged without being fetched.

The older DOM inspector and expansion scripts remain as experimental diagnostic code and are not invoked by the scan button. A failed JSON request reports an error instead of silently falling back to UI automation.

Semester sync reads the semester ID selected inside Resources and never queries or navigates website tabs. It refuses a request for a different semester while another is running. The optional advanced individual-course scan still uses the tab captured by Connect and validates it again before saving. Saved outlines can be selected independently of the currently open website course. The advanced scan's source tab is shown in Resources → Advanced.

No scheduled catalog refresh, archive extraction, PDF text extraction/OCR, or hosted ChatGPT plugin is included. Automatic retrieval supports NYU-hosted PDFs from the synced catalog; external links, videos, LTI resources and other formats remain catalog entries. Opening a topic can affect Brightspace's viewed/completion tracking, just as manual navigation does.

## Verify

Run `npm test` and `npm run check` (or `npm.cmd` in PowerShell if script execution is restricted).

Manual acceptance: scan with every website module collapsed and verify the full hierarchy appears without changing the page; check nested modules and catalog search; rescan and check no duplicate IDs; close/reopen popup and confirm persistence; request a PDF download and check actual bytes; test with a signed-out browser and an unsupported page. Do not count a login HTML page as a downloaded document. Use a separate browser profile to test signed-out behavior without disrupting your usual session.

Automated integration tests exercise the actual localhost HTTP service with a synthetic PDF source: pairing and unauthorized origins, first fetch, second-request hit, byte equality, restart persistence, changed versions, PDF rejection, size limits, and LRU eviction. The user also confirmed the signed-in Chrome-to-NYU-to-companion flow shows **Fetched and cached** followed by **Cache hit — no download**.

The core catalog → on-demand fetch → verified local PDF handoff is implemented and live-tested. Optional text-only indexing can follow; OCR is deferred. Public distribution, automatic companion startup and hosted ChatGPT support remain separate work.
