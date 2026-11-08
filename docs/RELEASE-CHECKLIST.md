# Pinned priority: Chrome Web Store submission

Updated November 7, 2026. The publisher completed the dashboard submission for the unlisted Windows/NYU pilot. The public listing did not yet show the extension title or an install button when checked.

## Next release target: 0.10.0 beta

The retrieval pipeline is accepted for the current MVP. The 0.10.0 beta companion was built at `da7a5dd792c0d879a564c02d272bf16882fc53b0`. The Chrome ZIP includes a hosted demo for extension review without the companion. See the [dashboard handoff](../store/UPDATE-0.10.0.md) for the current ZIP, checksums and review steps.

- [x] 140 source tests pass, including bounded PDF/Office reading, encrypted original-byte integrity, expiring download links and existing browser/demo flows.
- [x] The actual desktop connector read a real 10-page PDF completely in two bounded responses, with no plaintext export; user accepted the current retrieval pipeline.
- [x] Reviewer demo, compact terminal logs, encrypted storage and the latest UI changes are implemented.
- [x] Real PowerPoint reading works in the current desktop setup, confirmed by the user November 6. PDF and DOCX also have live reading evidence; other clients remain separate checks.
- [x] Live MCP semester refresh with Resources closed worked, confirmed by the user November 6; the companion terminal also reported success. Live expired-session recovery is not claimed by this check.
- [x] Freeze the source checkpoint and build matching 0.10.0 beta extension and installer artifacts with recorded hashes.
- [x] Packaged-runtime and isolated 0.9.4-to-beta upgrade checks passed against the frozen payload.
- [x] Live NYU document retrieval and cache reuse on 0.10.0 confirmed by the publisher.
- [x] Verify the extracted final Chrome ZIP in a clean profile without pairing. Hosted demo synced both courses, found the module note, and downloaded the original sample PDF.
- [x] Publish the matching setup, reviewer and privacy pages. Retain the existing listing screenshots, including the actual Chrome popup.
- [x] Submit 0.10.0 beta for the unlisted pilot on item `iadmhandkbomngnaplppiopojmfkcodi`.
- [ ] Verify installation and Hosted demo from the live Chrome Web Store listing, then add the verified install link to the setup page.

One-click MCP registration, tray/autostart, automatic updates, Claude, Firefox and indexing/RAG/OCR remain follow-ups. They are not added as beta blockers. Live tests and final packaging should not introduce another feature sweep.

- [ ] Low priority, after the beta submission. Auto-dismiss the Resources “Download started” banner after a short delay. Keep download errors and per-file status visible.

## Previous replacement candidate: v0.9.3

The last recorded dashboard upload for draft `iadmhandkbomngnaplppiopojmfkcodi` was v0.9.1. The v0.9.3 packet below is retained as a historical candidate; use the final 0.10.0 beta artifacts after the checks above rather than uploading this older packet. Do not create another store item. See `store/UPDATE-0.9.3.md` and `docs/DEMO-LMS.md`.

- [x] 130 source tests pass, including the real demo HTTP/background/MCP workflow; focused final namespace-collision, cached-offline and MCP checks pass.
- [x] The 34-entry extension ZIP validates without new permissions or remote executable extension code.
- [x] Local fictional LMS, original PDF/PPTX/DOCX files, nested modules, module notes, resync mutation and simulated access expiry are implemented.
- [x] Demo browser data, encrypted companion vault/cache/queue and MCP resource URIs are isolated from NYU, including identical numeric document IDs.
- [x] Matching Windows build, final packaged-runtime smoke, isolated 0.9.2-to-0.9.3 upgrade and source/ZIP/payload hash record; see `store/RELEASE-0.9.3.md`.
- [x] Matching public installer/setup and working-demo review guide published as Site version 7; public EXE hash matches the tested artifact.
- [ ] Standalone Chrome acceptance with the final package: demo pairing/sync/download/uncached retrieval/cache hit/restart; switch to NYU and confirm the real library remains available.
- [ ] Actual desktop-host reading of the original sample files through MCP resource bytes or explicit opt-in export; do not claim host ingestion from transport tests alone.
- [ ] Replace ZIP in the existing draft; use `store/reviewer-instructions-500.txt` for the Test instructions field and leave NYU credentials blank. Save draft, review remaining dashboard warnings and submit manually.

The earlier encrypted-storage v0.9.2 build remains preserved, with its release record and isolated upgrade checks. Local demo fixtures do not verify real NYU authentication or guarantee review approval.

## Previous frozen submission candidate: v0.9.1

- [x] 115 source tests and syntax checks pass.
- [x] Final 31-entry ZIP validates, with root manifest, local code, licenses and icons only.
- [x] Matching Windows installer built; packaged-runtime startup, original PDF/PPTX/DOCX transport, module notes, catalog-sync tools and restart checks pass.
- [x] Three 1280×800 screenshots captured using labelled synthetic data; no real course catalog is published.
- [x] Listing, permission/privacy answers and honest NYU access instructions prepared in `store/`.
- [x] Publisher confirmed Chrome developer registration. Verify contact email and two-step verification in the dashboard.
- [x] Final isolated v0.9.0-to-v0.9.1 upgrade check and source/ZIP/payload comparison recorded.
- [x] Freeze source checkpoint and artifact hashes; see `store/RELEASE-0.9.1.md` and the local release record.
- [x] Publish matching preview installer, updated privacy policy, setup guide and supplementary reviewer walkthrough.
- [ ] Complete standalone Chrome/NYU acceptance, including [MCP catalog sync](MCP-CATALOG-SYNC.md) with Resources closed and an original uncached document read by the actual host.
- [x] Implement protected persistent storage in v0.9.2. Normal MCP reads create no plaintext path; separately enabled exports are explicitly unencrypted. Legacy/offline migration and host-managed copies are disclosed. See ENCRYPTED-STORAGE.md; store acceptance remains Google’s decision.
- [ ] Check the extracted final ZIP with a fresh Chrome profile: first pairing, semester hierarchy/notes, search, download, retrieval, cache hit and restart. Verify real host PPTX/DOCX reading before advertising tested client compatibility; original-byte transport is already covered automatically.
- [ ] Upload ZIP as a draft; complete listing, privacy, test instructions and Unlisted distribution.
- [ ] Submit for review, preferably with automatic publishing disabled for the initial pilot; record item ID and review outcome.

Artifact hashes and verification evidence live in the local `dist/BrightspaceContext-0.9.1-release-record.json` and the upload packet. Earlier v0.8.9/v0.9.0 artifacts are retained as historical checkpoints; use the final v0.9.1 ZIP for this draft.

## Reviewer access

No authorized institutional test account has been arranged. Reviewers should not be assumed to have NYU access. `store/reviewer-instructions.md` states the restriction explicitly and provides the working local fictional LMS alongside the supplementary screenshot walkthrough. Google documents the Test instructions tab as optional; supplementary evidence does not guarantee acceptance of restricted functionality. Address any request for access through an authorized institutional arrangement or the store review process. Do not share personal school credentials.

## Public materials

- Privacy: https://brightspace-context.khin101.chatgpt.site/
- Setup/installer: https://brightspace-context.khin101.chatgpt.site/setup/
- Reviewer walkthrough: https://brightspace-context.khin101.chatgpt.site/review/
- MIT source: https://github.com/khin101wastaken/brightspace-context
- Publisher: Khin Aung; support: khinaungwrk@gmail.com

The static site hosts documentation and installers only. Course catalogs/files remain local until requested by the user's chosen AI client. No hosted course-data deployment is planned.

## After the first upload

Record the real Chrome Web Store item ID/install URL and wire it into companion onboarding and the public setup guide. A store-installed copy has separate identity/storage from an unpacked development copy and must be paired explicitly. Do not run both workers against the same companion unintentionally. Normal updates to the same store item retain its ID.

## Deferred improvements

Simpler MCP registration, Claude MCPB packaging, tray/autostart, automatic companion updates, Firefox, other platforms and RAG/OCR remain follow-ups. They should not delay this submission. Current manual MCP setup and supported environment must remain clear.

## Companion logging follow-up

The source now has compact normal logs, separate NYU/Demo labels, useful sync/cache outcomes and actionable errors; verbose mode retains structured events, IDs and request timings. This companion-only change is published in installer 0.9.4; the 0.9.3-to-0.9.4 upgrade check passes. The frozen 0.9.3 installer and Chrome upload ZIP remain unchanged. See `store/RELEASE-COMPANION-0.9.4.md`. See `COMPANION-LOGGING.md`.

## UI review patch before 0.10.0 beta

Demo/library selection now lives only in Resources → Advanced → Demo and testing. The popup has no demo controls; a small active-demo notice remains so fictional content stays identifiable. Syntax, package/import checks and browser preview checks passed, including switching both ways and popup settings.

The source and the user's installed unpacked extension were updated for review, with the six original UI/instruction files backed up under `.cache/installed-ui-backups/`. Cache, pairing, permissions and MCP processes were not changed. The installed PAYLOAD inventory still describes the immutable release; this explicit local review patch is not a new published package. The 0.9.4 installer and frozen 0.9.3 ZIP remain unchanged. Rebuild the beta after acceptance; update reviewer/setup instructions to the Advanced location at that time.
