# Chrome Web Store submission draft

Package version: 0.10.0 beta. See the [dashboard handoff](UPDATE-0.10.0.md) for the existing draft and current upload steps.

Pinned priority: finish the [submission essentials](../docs/RELEASE-CHECKLIST.md) and submit the unlisted pilot. Automatic MCP registration and other optional features can follow.

Publisher name: **Khin Aung**. Public support contact: **khinaungwrk@gmail.com**. The publisher confirmed developer registration on November 5; verify contact email and two-step verification in the dashboard before submission.

Public privacy-policy URL: **https://brightspace-context.khin101.chatgpt.site**. The static page is published with public access and contains the policy/support information only. The privacy website does not host course content or the companion service.

## Build the upload

```text
npm ci
npm run package:extension
```

Upload only `dist/BrightspaceContext-0.10.0-chrome-web-store.zip`. The SHA-256 and file inventory beside it are build records, not additional ZIP contents. The manifest is at the ZIP root. The ZIP includes 28 browser files, the MIT and third-party licenses, and four PNG icons (34 entries); it excludes the companion, Node, MCP server, dependencies, course files, tokens, profiles, tests and developer-only inspection/expansion scripts. All executable JavaScript is bundled locally. The checked-in HTML parser bundle is generated from `assets/rich-text.js` with `npm run build:rich-text`; `npm run build:rich-text -- --check` verifies it. The parser, entity decoder and document validator ship as local browser assets with their licenses; bundling tools remain development dependencies.

Module landing-page context requires the v0.8.8 companion/MCP update as well as reloading the extension and syncing the semester again. Older catalogs remain readable and mark missing descriptions as not synced. Reload the desktop MCP connection after updating. The development extension stays loaded from its existing folder unless explicitly changed.

The initial document-stack icon has an editable [SVG source](../assets/extension-icon.svg). Checked-in PNGs are 16, 32, 48 and 128 pixels. The store's 128px version centers a 96px mark with 16px transparent margins. Maintainers can regenerate them with `python scripts/generate-extension-icons.py` (Pillow is a development tool only).

Source repository: https://github.com/khin101wastaken/brightspace-context . The public source is licensed under MIT; course materials retain their owners' rights. The 0.10.0 beta includes the UI/search updates, extension-only motion/appearance preferences, completed-course sync ring, and MCP-initiated semester discovery/catalog sync. Release checks and remaining live acceptance are recorded in [RELEASE-CHECKLIST.md](../docs/RELEASE-CHECKLIST.md). The matching preview installer is linked from the public setup page; automated tests do not replace live NYU/client acceptance.

The 0.10.0 beta includes an all-user local fictional LMS for review/testing. Use the matching companion and see `reviewer-instructions.md`; the real NYU library remains separate.

## Draft listing text

Name from manifest: **Brightspace Catalog (NYU Prototype)**. This can be changed before the first upload by changing the manifest and rebuilding.

Short description from manifest:

> Catalog NYU Brightspace course outlines locally and request individual document downloads.

Single purpose:

> Organize a user's NYU Brightspace course resources and retrieve selected course files locally for downloading or use with a connected desktop AI client.

Description draft:

Browse your NYU Brightspace resources by semester, course and module. Search filenames and module notes, view matching text, and download individual accessible Brightspace-hosted files with their module folders.

Optionally pair the local Windows companion with a supported desktop MCP client to refresh semester catalogs and retrieve original PDF, PPTX and DOCX files on demand. Keep Chrome signed in and the companion running for automatic requests. Files are cached individually rather than downloaded in bulk. Persistent companion data is encrypted using a Windows-account-protected key; browser catalogs are encrypted too.

The local MCP server reads PDF text layers and Word or PowerPoint text from the encrypted cache. Original document bytes are available through MCP resources. Both paths read in memory. For clients requiring a file path, a separately enabled temporary-export feature creates explicitly requested unencrypted copies with a 15-minute expiration. A crash can leave these copies until the companion next starts. Ordinary downloads remain where you save them.

Hosted demo lets you sync, search, and download fictional course materials in the extension without a school account or companion. Local demo uses the companion to demonstrate pairing, caching, and desktop MCP retrieval with the same sample materials. Real course features remain limited to NYU.

The browser uses your existing NYU Brightspace session. Course catalogs are saved in Chrome and the paired companion. There is no publisher-operated course-content server or analytics service. Your chosen AI client may send requested context to its provider under its own settings and policies.

Browsing/downloading requires access to your own NYU Brightspace courses. Desktop AI retrieval additionally requires the companion and a configured local MCP client. The packaged companion currently targets Windows 10/11 x64. This is an independent prototype, not an official NYU or D2L product.

## Permission explanations

| Permission | Purpose |
| --- | --- |
| `storage` | Save encrypted course/resource metadata and an encrypted companion credential, ordinary interface preferences, and session-memory working data/download status. Raw browser keys and live bearer credentials are not persisted. |
| `downloads` | Start user-requested course-file downloads and track those downloads' completion/errors. |
| `alarms` | Recover the local retrieval connection after extension-worker suspension or companion restart. The alarm does not bulk-download course files. |
| `scripting` | Activate the user-requested native download-button fallback inside permitted NYU pages. Semester and advanced per-course scans use fixed web endpoints. |
| `https://brightspace.nyu.edu/*` | Request the user's semester/course/content outlines and selected accessible hosted files using the browser's existing signed-in session. |
| `http://127.0.0.1/*` | Communicate with the user-paired local companion. The application connects to port 47653 using origin/token checks. No publisher-hosted relay is used. |
| `https://brightspace-context.khin101.chatgpt.site/*` | Read public fictional course outlines, module notes, and sample files when the user selects Hosted demo. These requests omit credentials and carry no NYU course data. |

The redundant `activeTab` permission was removed: the NYU host permission already covers permitted tabs and script execution. No `tabs`, `cookies`, `webRequest`, broad web access, or remote executable code permission is requested.

## Finish before submitting

- Confirm the extension display name; the publisher/contact details above are supplied.
- Use the published privacy-policy URL above. Store disclosures must match the [policy](privacy-policy.md) and actual handling of course content/pairing data even though storage is local.
- Public setup URL: https://brightspace-context.khin101.chatgpt.site/setup/ . The guide links the matching installer and checksum; verify these published artifacts before submission.
- Upload the four 1280×800 RGB JPEG screenshots in `store/assets/screenshots/`. The first three show actual extension UI with clearly labelled synthetic course data, not a student's private catalog. The fourth includes the publisher-supplied actual Chrome popup capture. The data fixture is not an extension feature.
- Provide the mandatory store icon and screenshot assets in the dashboard; the extension PNG icons are already included in the ZIP.
- Paste [reviewer-instructions-500.txt](reviewer-instructions-500.txt) into Additional instructions. No institutional test account has been arranged; do not assume reviewers have NYU access. The walkthrough supplements the access disclosure and does not guarantee approval. If review requests access, arrange an authorized institutional solution or address it through the review process.
- Load the ZIP's extracted contents in a fresh Chrome profile and check pairing, catalog sync, nested modules, downloads, one uncached PDF, cache repeat and restart.
- Select **Unlisted** for the pilot and complete store review. Unlisted items are accessible to anyone with the link and are reviewed too.

Privacy/data-use answers are not automatically filled by this package. In particular, do not claim the product handles no user data just because the publisher runs no backend: it handles website/course content locally and can provide metadata/files to the user's chosen AI client.

## First upload and future updates

Upload the ZIP in the developer dashboard, complete Listing/Privacy/Distribution/Test instructions, then submit for review when those fields and assets are complete. Uploading does not itself mean approval or publication. Subsequent packages need a higher manifest version.

After the first upload assigns the store item ID, record its real install URL for companion onboarding. A store-installed extension may have a different ID/storage from the current unpacked copy, so pair that copy explicitly. Future store updates to the same listing keep the store ID. Keep private signing keys and account credentials outside the ZIP and repository.

Official references:

- [Prepare the extension ZIP and manifest](https://developer.chrome.com/docs/webstore/prepare)
- [Publish and complete dashboard fields](https://developer.chrome.com/docs/webstore/publish)
- [Image requirements](https://developer.chrome.com/docs/webstore/images)
- [User-data policy FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Visibility and review](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)
