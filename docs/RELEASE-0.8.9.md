# v0.8.9 publishing candidate

Prepared November 5, 2026. This candidate freezes the extension and companion together; it has not been submitted to Chrome Web Store. The earlier v0.8.8 public download remains available during acceptance.

## Automated preparation

Run `npm test`, `npm run build:rich-text -- --check` and `npm run check`. From the same clean source commit, run `npm run package:extension`, `npm run build:windows`, `npm run test:installer` and `npm run test:upgrade`. The upgrade check uses an isolated application identity, shortcuts and synthetic cache.

The final extension ZIP and staged installer's packaged browser files must have identical bytes. Check the MIT license in both packages. Record the source commit, installer/ZIP SHA-256 values and check results in the ignored `dist` release record. No pairing credentials, course documents or private catalog data belong in that record.

## Automated results

Passed on November 5, 2026, from clean source commit `d244f9b9b6c8df3e2f9f233708a9765125f6d4eb`: all 83 tests, generated-bundle and syntax checks, [GitHub CI](https://github.com/khin101wastaken/brightspace-context/actions/runs/42060539220), packaged-runtime smoke, and isolated v0.8.8-to-v0.8.9 upgrade/uninstall acceptance. All 26 store ZIP files match the corresponding packaged installer files exactly, and both distributions contain the MIT license. These automated checks do not establish fresh-profile or actual host file-reading acceptance.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `BrightspaceContext-0.8.9-chrome-web-store.zip` | 83,253 | `4d6af8fb9b9ef26a5ccdcda00114117e6d76622c1ea4abebbfe5f87a8ae8cdd0` |
| `BrightspaceContext-0.8.9-windows-x64-setup.exe` | 25,718,555 | `aa23c83ccc056a74f97e48feff7beed8c85d571075e7c9ed59cee1c9bca46bcb` |

The local release record is `dist/BrightspaceContext-0.8.9-release-record.json`. An exact extraction of the ZIP is available at `dist/chrome-acceptance-0.8.9` for the manual Chrome check. Do not rebuild or replace these artifacts while recording acceptance against these hashes; changed files require a new record.

## Manual acceptance, guided one step at a time

1. Register the Chrome Web Store developer account and reach the developer dashboard.
2. Close the current companion and upgrade with `BrightspaceContext-0.8.9-windows-x64-setup.exe`. Start the installed companion and confirm the expected cache directory. Existing cache data should remain available.
3. Create a separate Chrome profile for acceptance. Extract `BrightspaceContext-0.8.9-chrome-web-store.zip` to a stable local folder, load that folder through Developer mode, and sign into NYU Brightspace in that profile. Avoid two active retrieval workers: disable the extension in the earlier Chrome profile while testing.
4. Pair the test extension with the installed companion. Switching the paired extension origin can require pairing again when returning to the original profile; the saved cache is separate from browser pairing.
5. Sync a semester and check course/module hierarchy, module notes, word-prefix search/highlighting, resource links and downloads. Include a PDF and a non-PDF download.
6. Restart the desktop MCP connection so it uses the updated installed code. Request a supported uncached document, read its actual contents with the host's reader, and repeat to verify a cache hit. Verify PDF and a real PPTX/DOCX when those formats are advertised. A returned path or metadata alone is not evidence of successful host reading.
7. Restart the companion and confirm retained pairing/catalog/cache plus working retrieval. Check that an offline companion gives an actionable connection status.

Do not record an acceptance step as passed until observed. Keep live documents and screenshots private unless their owners authorize publication.

## Submission follow-through

After acceptance, publish the matching installer, update the public setup/reviewer links, capture cleared or synthetic store screenshots, finalize privacy/permission declarations and resolve legitimate reviewer access for NYU-only live features. Upload only the extension ZIP to the Chrome dashboard. Keep reviewer credentials out of this public repository.
