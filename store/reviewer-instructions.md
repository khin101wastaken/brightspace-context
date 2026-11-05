# Reviewer instructions: Brightspace Catalog v0.9.1

Access limitation: live course functionality requires an authorized NYU Brightspace account with enrolled courses. No institutional test/guest account is currently supplied. We do not assume reviewers have NYU access. No school password or publisher credentials are included in this repository/package. Please contact khinaungwrk@gmail.com if additional access or evidence is needed; an institutional access arrangement would need authorization.

## Requirements

- Chrome 116+ and access to authorized NYU Brightspace courses for live course features.
- For companion/file retrieval features: Windows 10/11 x64, the local companion from https://brightspace-context.khin101.chatgpt.site/downloads/BrightspaceContext-0.9.1-windows-x64-setup.exe, and an MCP client with local document-reading support.
- Companion installation/setup guide: https://brightspace-context.khin101.chatgpt.site/setup/.

The extension is limited to NYU Brightspace; it does not claim to work with an arbitrary LMS tenant. A reviewer who lacks authorized NYU access cannot verify live course content merely by following the steps below. The public walkthrough at https://brightspace-context.khin101.chatgpt.site/review/ shows actual UI with labelled synthetic data; it is supplementary evidence, not a live demo or a substitute for any access Google requests. The extension contains no synthetic/demo course mode.

## Expected flow

1. Install the extension from the review package/listing.
2. Open the popup. Browsing resources is separate from connecting the optional companion. An unpaired/offline companion should produce an actionable status, not a request for school credentials. Without NYU access, the Connect/Settings interface, appearance/motion preferences and companion pairing can still be inspected; live semester/course content cannot.
3. Sign into NYU Brightspace in the same Chrome profile. No school password/cookie values are copied into the companion.
4. Open Resources, choose a semester and Sync semester. Course/module hierarchy is obtained without expanding every webpage module. Metadata scanning does not bulk-download files.
5. Expand a module and use the inline Download/Save as controls on an accessible hosted file. External links and locked items are not treated as direct downloads.
6. Start the installed companion, enter its displayed pairing code in Connect and check the connected status. The companion listens on loopback port 47653; the code authorizes this extension origin locally.
7. Configure a local MCP client using the matching updated setup guide. With Resources closed, call request_catalog_sync without semesterId to discover semesters, then with a returned semesterId to refresh one semester. Poll get_catalog_sync; verify the refreshed course/module hierarchy and notes through search_catalog. Find one supported, uncached catalog PDF, request it, wait for ready, and read the returned local PDF. The model must read the actual file; catalog metadata alone is not document content.
8. Repeat the request. The result should be a cache hit. Restart the companion; pairing/catalog/cache should persist.
9. If the Brightspace session expires, sign in again and retry catalog sync through MCP with retry:true after sign-in; this also resumes login-blocked pending requests. If Chrome is closed, requests stay queued until the paired worker returns.

## Implementation notes

All extension JavaScript is included in the ZIP. The companion exchanges JSON notifications and file data; it does not deliver executable extension code. No `eval`, remote script loader, publisher-hosted course backend or analytics transport is used. The Windows installer and MCP runtime are separate from the extension ZIP.

The `scripting` permission supports the user-requested native download-control fallback. Semester discovery and per-course scans use fixed NYU web endpoints. The NYU and loopback host permissions are the only requested hosts.
