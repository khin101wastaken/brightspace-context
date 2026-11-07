# Reviewer instructions: Brightspace Catalog 0.10.0 beta

## Test the extension without the companion

1. Install the Chrome extension under review. Open the popup and choose **Browse resources**.
2. Choose **Advanced → Demo and testing → Hosted demo**. Select **Demo 2026 Fall** and click **Sync semester**. Expect two courses.
3. Select Urban Garden Lab and search `east gate` for a module note. Clear the search, expand Fieldwork and Week 1: Observation, and download the field guide PDF using its inline button.

The [hosted demo](https://brightspace-context.khin101.chatgpt.site/demo/) serves the fictional outlines and files to the extension. To test companion features and simulated session recovery across both apps, use the Local demo below.

## Working local demo: no school account needed

The companion includes an interactive fictional LMS that uses the same extension sync, parsing, download, worker/cache and MCP paths. This feature is available to all users. It is clearly labeled Demo and kept separate from the real NYU library. It does not grant or validate NYU access.

1. On Windows 10/11 x64, install companion 0.10.0 beta from https://brightspace-context.khin101.chatgpt.site/setup/ and keep it running. The separate unsigned preview installer includes Node; no development checkout or npm is needed.
2. Install the extension package under review. Open its popup and enter the code printed by the companion. School credentials are never requested by the extension.
3. Choose **Resources → Advanced → Demo and testing → Local demo**, then select **Demo 2026 Fall** and **Sync semester**. Expect two courses, nested modules, module landing-page notes, file types and inline Download/Save as controls. Search `east gate` to find a note. The scan downloads metadata, not every file.
4. Download the PDF, DOCX or PPTX sample. Locked items and external links do not get direct-download controls. Advanced → Show manual cache buttons allows a manual cache test; cache the same file twice to see a fetch followed by a hit.
5. Open http://127.0.0.1:47653/demo/ . Add a sample reading, then resync in Resources; an additional reading and updated notes appear. Simulate expired access, try an uncached retrieval or fresh scan, restore access on the demo page and retry. Reset affects only fictional fixtures and does not delete the real library.
6. Optional MCP test: configure a local STDIO client using the installed Setup guide's Command/Argument. For each demo tool call pass `provider: "demo"`. Discover semesters with request_catalog_sync without semesterId, sync the returned semester, search_catalog, request_document for a supported uncached sample, and poll get_document_request as needed. Use `read_document_text` to read the cached document. Expected file check values: PDF CEDAR-42; PPTX WILLOW-28; DOCX MAPLE-17. A second request should be a cache hit. Successful catalog sync requests are deduplicated for 30 seconds; wait before resyncing that same semester through MCP.
7. Restart the companion and browser. Saved encrypted catalogs/cache and pairing should remain accessible; the demo's in-memory access/content controls return to defaults. Sync again to refresh changed sample content. Switch back to **NYU Brightspace** to return to the separate real library.

Normal MCP retrieval creates no plaintext localPath. If a client requires one, explicitly enable extension Settings → Temporary file exports and call export_document with provider:demo, the document id and acknowledgePlaintext:true. Requested copies are unencrypted, expire after 15 minutes and are removed on normal shutdown; a crash can leave them until the next start. Ordinary downloads are separate readable files.

## Live NYU access limitation

Real course functionality requires an authorized NYU Brightspace account with enrolled courses in the same Chrome profile. No institutional reviewer account is supplied; we do not assume reviewers have one. The demo provides a runnable way to evaluate the local pipeline but cannot prove real NYU authentication or endpoint behavior. If institutional access is required, contact khinaungwrk@gmail.com; an access arrangement would need authorization. No school password, cookie or publisher credentials are included.

## Implementation notes

All executable extension code ships inside the ZIP. The companion sends JSON, notifications and requested document bytes to the extension. Host access covers NYU Brightspace, loopback and the public demo site. The hosted endpoints serve only fictional course data and original sample files. There is no publisher-operated backend for real course content or application analytics. The extension ZIP and Windows companion installer are separate packages.

Full setup: https://brightspace-context.khin101.chatgpt.site/setup/ . Public review guide: https://brightspace-context.khin101.chatgpt.site/review/ .
