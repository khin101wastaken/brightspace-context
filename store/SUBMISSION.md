# Chrome Web Store submission draft

Package version: 0.8.8. Submission status: not uploaded or submitted.

Pinned priority: finish the [submission essentials](../docs/RELEASE-CHECKLIST.md) and submit the unlisted pilot. Automatic MCP registration and other optional features can follow.

Publisher name: **Khin Aung**. Public support contact: **khinaungwrk@gmail.com**. The Chrome developer account still needs its own registration/verification.

Public privacy-policy URL: **https://brightspace-context.khin101.chatgpt.site**. The static page is published with public access and contains the policy/support information only. The privacy website does not host course content or the companion service.

## Build the upload

```text
npm ci
npm run package:extension
```

Upload only `dist/BrightspaceContext-0.8.8-chrome-web-store.zip`. The SHA-256 and file inventory beside it are build records, not additional ZIP contents. The manifest is at the ZIP root. The ZIP includes 20 browser files, third-party licenses and four PNG icons; it excludes the companion, Node, MCP server, dependencies, course files, tokens, profiles, tests and developer-only inspection/expansion scripts. All executable JavaScript is readable and bundled locally. The checked-in HTML parser bundle is generated from `assets/rich-text.js` with `npm run build:rich-text`; `npm run build:rich-text -- --check` verifies it. `htmlparser2`, its entity decoder, the `fflate` package validator and their licenses are shipped as local browser assets; `esbuild` remains a development tool. `fflate` and the other bundling tools are development dependencies; only the generated local browser modules and their licenses ship, with no npm runtime dependency needed for document validation.

Module landing-page context requires the v0.8.8 companion/MCP update as well as reloading the extension and syncing the semester again. Older catalogs remain readable and mark missing descriptions as not synced. Reload the desktop MCP connection after updating. The development extension stays loaded from its existing folder unless explicitly changed.

The initial document-stack icon has an editable [SVG source](../assets/extension-icon.svg). Checked-in PNGs are 16, 32, 48 and 128 pixels. The store's 128px version centers a 96px mark with 16px transparent margins. Maintainers can regenerate them with `python scripts/generate-extension-icons.py` (Pillow is a development tool only).

Source repository: https://github.com/khin101wastaken/brightspace-context . The public source is licensed under MIT; course materials retain their owners' rights. Source changes newer than the downloadable v0.8.8 installer must be tested and packaged together before store submission.

## Draft listing text

Name from manifest: **Brightspace Catalog — NYU Prototype**. This can be changed before the first upload by changing the manifest and rebuilding.

Short description from manifest:

> Catalog NYU Brightspace course outlines locally and request individual document downloads.

Single purpose:

> Organize a user's NYU Brightspace course resources and retrieve selected course files locally for downloading or use with a connected desktop AI client.

Description draft:

Browse your NYU Brightspace resources by semester, course and module. Search saved resource metadata, download individual Brightspace-hosted files with their module folders, and optionally connect a local companion to retrieve course PDF, PPTX and DOCX files through a supported desktop MCP client.

The browser uses your existing NYU Brightspace session. Course catalogs are saved in Chrome and the paired companion; Supported files are cached individually on demand. There is no publisher-operated course-content server or analytics service.

Browsing/downloading requires access to your own NYU Brightspace courses. Desktop AI retrieval additionally requires the companion and a configured local MCP client. The packaged companion currently targets Windows 10/11 x64. This is an independent prototype, not an official NYU or D2L product.

## Permission explanations

| Permission | Purpose |
| --- | --- |
| `storage` | Save course/resource metadata, preferences, the local companion pairing token and transient download status in extension storage. |
| `downloads` | Start user-requested course-file downloads and track those downloads' completion/errors. |
| `alarms` | Recover the local retrieval connection after extension-worker suspension or companion restart. The alarm does not bulk-download course files. |
| `scripting` | Activate the user-requested native download-button fallback inside permitted NYU pages. Semester and advanced per-course scans use fixed web endpoints. |
| `https://brightspace.nyu.edu/*` | Request the user's semester/course/content outlines and selected accessible hosted files using the browser's existing signed-in session. |
| `http://127.0.0.1/*` | Communicate with the user-paired local companion. The application connects to port 47653 using origin/token checks. No publisher-hosted relay is used. |

The redundant `activeTab` permission was removed: the NYU host permission already covers permitted tabs and script execution. No `tabs`, `cookies`, `webRequest`, broad web access, or remote executable code permission is requested.

## Finish before submitting

- Confirm the extension display name; the publisher/contact details above are supplied.
- Use the published privacy-policy URL above. Store disclosures must match the [policy](privacy-policy.md) and actual handling of course content/pairing data even though storage is local.
- Public setup URL: https://brightspace-context.khin101.chatgpt.site/setup/ . The guide links the matching installer and checksum; verify these published artifacts before submission.
- Capture accurate screenshots with synthetic or appropriately cleared data. Do not publish a student's private course catalog or documents as listing screenshots.
- Provide the mandatory store icon and screenshot assets in the dashboard; the extension PNG icons are already included in the ZIP.
- Finish [reviewer-instructions.md](reviewer-instructions.md), including a legitimate way for reviewers to assess the NYU-only functionality. An ordinary reviewer may not have NYU access.
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
