# Local demo LMS

The matching Windows companion serves a working fictional LMS at `http://127.0.0.1:47653/demo/`. It needs no NYU account and is available to every user, including reviewers. It is local sample content, not a publisher-hosted course service or an imitation NYU sign-in page.

## Try it

1. Start the 0.10.0 beta companion and pair the extension using its printed code. Reload the extension after updating its files.
2. Open Resources → **Advanced → Demo and testing** and choose **Local demo**, then sync **Demo 2026 Fall**. Switch back to NYU from the same Advanced section. The popup has no demo controls.
3. Browse the two courses and nested modules, search `east gate`, inspect module notes, and download PDF/PPTX/DOCX samples. Advanced → Show manual cache buttons exposes the optional Cache action.
4. In a connected MCP client ask it to use the demo library. Every tool call for this library takes `provider: "demo"`; omitted provider means real NYU. Discover semesters with `request_catalog_sync`, scan the returned semester, find a file with `search_catalog`, retrieve it with `request_document`, poll if pending and use `read_document_text` to read the cached document. Repeating the request should hit the cache.
5. Open the demo LMS page and choose **Add a sample reading**. Sync again in Resources to see the added item and updated module notes. MCP sync retains its normal 30-second completed-request deduplication window; wait that window before requesting another successful scan of the same semester.
6. Choose **Simulate expired session**, then try a fresh scan or an uncached file. Restore access on the demo page and retry the blocked operation (`retry: true` through MCP). A fresh cached document remains readable while access is expired.

Known check values, contained in the actual original files: field-guide PDF `CEDAR-42`, slide deck `WILLOW-28`, worksheet `MAPLE-17`.

The 0.10.0 beta includes `read_document_text` for paged PDF/DOCX/PPTX reading, plus `create_document_link` when a user explicitly requests a local download. Keep `provider: "demo"` on these calls too. See [document handoff](DOCUMENT-HANDOFF.md) for acceptance checks and client limitations.

**Reset sample content** restores fictional content/access; it does not erase saved catalogs or cached files. Sync again to refresh the outline. Fixture controls reset when the companion restarts. No control changes NYU access, grades, assignments or files.

## Implementation and isolation

The public `/demo/` routes serve only allowlisted packaged assets and fictional Brightspace-shaped JSON. They do not proxy NYU or expose vault files. The page uses same-origin, JSON-only controls; cross-origin control submissions are rejected. Protected `/v1/` APIs still require the paired extension origin and bearer token. No new extension permission or runtime dependency is needed.

Demo uses the production semester/course client, recursive outline and rich-text parsers, search/rendering, download preflight, worker leases, encrypted cache and MCP resource handoff. Only the fixed endpoint provider and fictional responses differ. It exercises module-detail fallback, nested modules, locked and external resources, original documents, resync changes and expired access.

Browser catalog/folder/selection/progress keys have a `demo:` namespace and receive the same encrypted-storage treatment. Pairing and appearance preferences remain shared. The companion stores separate encrypted catalog/index/request/blob files in `<cache>/demo`, using its own Windows-protected vault key; real files stay in the existing cache root. Demo has its own bounded cache budget. Each provider has its own worker channel and durable queue; model demo operations continue even when the UI is displaying NYU. Global Pause/Disconnect applies to both.

The API selects demo only under the explicit `/demo-api/v1/` namespace; older companions reject that path rather than interpreting a demo write as an NYU operation; the MCP tool dispatcher binds `provider` to a library instance for the entire request and all polling. Demo links use `brightspace-cache://demo/documents/<id>`. Real resource links retain their existing format. Even identical numeric document IDs cannot read across libraries. NYU download/cache validation still rejects local demo URLs unless explicitly operating in demo scope.

Sample documents are original MIT-licensed project fixtures generated with `scripts/generate-demo-documents.py`. Python/docx/pptx/reportlab are development-only generation tools, not runtime dependencies. The companion ships the generated binaries and static website; the extension ZIP contains only browser code.

The demo verifies the local workflow, not NYU authentication, real endpoint compatibility, every LMS tenant, or a particular AI client's document ingestion. Final standalone Chrome, installed-app and desktop-client acceptance remains a separate live check. Chrome Web Store approval is not guaranteed.
