# Reviewer instructions: Brightspace Catalog v0.9.3

## Working local demo: no school account needed

The companion includes an interactive fictional LMS that uses the same extension sync, parsing, download, worker/cache and MCP paths. This feature is available to all users. It is clearly labeled Demo and kept separate from the real NYU library. It does not grant or validate NYU access.

1. On Windows 10/11 x64, install companion 0.9.4 (compatible with extension 0.9.3) from https://brightspace-context.khin101.chatgpt.site/setup/ and keep it running. The separate unsigned preview installer includes Node; no development checkout or npm is needed.
2. Install the extension package under review. Open its popup and enter the code printed by the companion. School credentials are never requested by the extension.
3. Open extension Settings and select **Local demo**. Open **Browse resources**, select **Demo 2026 Fall** and **Sync semester**. Expect two courses, nested modules, module landing-page notes, file types and inline Download/Save as controls. Search `east gate` to find a note. The scan downloads metadata, not every file.
4. Download the PDF, DOCX or PPTX sample. Locked items and external links do not get direct-download controls. Advanced → Show manual cache buttons allows a manual cache test; cache the same file twice to see a fetch followed by a hit.
5. Open http://127.0.0.1:47653/demo/ . Add a sample reading, then resync in Resources; an additional reading and updated notes appear. Simulate expired access, try an uncached retrieval or fresh scan, restore access on the demo page and retry. Reset affects only fictional fixtures and does not delete the real library.
6. Optional MCP test: configure a local STDIO client using the installed Setup guide's Command/Argument. For each demo tool call pass `provider: "demo"`. Discover semesters with request_catalog_sync without semesterId, sync the returned semester, search_catalog, request_document for a supported uncached sample, and poll get_document_request as needed. Read the original MCP resource bytes. Expected file check values: PDF CEDAR-42; PPTX WILLOW-28; DOCX MAPLE-17. A second request should be a cache hit. Successful catalog sync requests are deduplicated for 30 seconds; wait before resyncing that same semester through MCP.
7. Restart the companion and browser. Saved encrypted catalogs/cache and pairing should remain accessible; the demo's in-memory access/content controls return to defaults. Sync again to refresh changed sample content. Switch back to **NYU Brightspace** to return to the separate real library.

Normal MCP retrieval creates no plaintext localPath. If a client requires one, explicitly enable extension Settings → Temporary file exports and call export_document with provider:demo, the document id and acknowledgePlaintext:true. Requested copies are unencrypted, expire after 15 minutes and are removed on normal shutdown; a crash can leave them until the next start. Ordinary downloads are separate readable files.

## Live NYU access limitation

Real course functionality requires an authorized NYU Brightspace account with enrolled courses in the same Chrome profile. No institutional reviewer account is supplied; we do not assume reviewers have one. The demo provides a runnable way to evaluate the local pipeline but cannot prove real NYU authentication or endpoint behavior. If institutional access is required, contact khinaungwrk@gmail.com; an access arrangement would need authorization. No school password, cookie or publisher credentials are included.

## Implementation notes

All executable extension code ships inside the ZIP. The local demo's scripts run in its own website, not as remotely loaded extension code. The companion sends JSON, notifications and requested document bytes to the extension. NYU and loopback are the only host permissions. No publisher-operated course backend or application analytics is included. The extension ZIP and Windows companion/MCP installer are separate matching packages.

Full setup: https://brightspace-context.khin101.chatgpt.site/setup/ . Public review guide: https://brightspace-context.khin101.chatgpt.site/review/ .
