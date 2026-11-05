# Pinned priority: Chrome Web Store submission

Updated November 5, 2026. Objective: submit an unlisted local Windows/NYU pilot. The extension has not been uploaded, reviewed or approved.

## Submission candidate: v0.9.1

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
- [ ] Check the extracted final ZIP with a fresh Chrome profile: first pairing, semester hierarchy/notes, search, download, retrieval, cache hit and restart. Verify real host PPTX/DOCX reading before advertising tested client compatibility; original-byte transport is already covered automatically.
- [ ] Upload ZIP as a draft; complete listing, privacy, test instructions and Unlisted distribution.
- [ ] Submit for review, preferably with automatic publishing disabled for the initial pilot; record item ID and review outcome.

Artifact hashes and verification evidence live in the local `dist/BrightspaceContext-0.9.1-release-record.json` and the upload packet. Earlier v0.8.9/v0.9.0 artifacts are retained as historical checkpoints; use the final v0.9.1 ZIP for this draft.

## Reviewer access

No authorized institutional test account has been arranged. Reviewers should not be assumed to have NYU access. `store/reviewer-instructions.md` states the restriction explicitly and links a synthetic screenshot walkthrough. Google documents the Test instructions tab as optional; supplementary evidence does not guarantee acceptance of restricted functionality. Address any request for access through an authorized institutional arrangement or the store review process. Do not share personal school credentials.

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

Terminal readability, simpler MCP registration, Claude MCPB packaging, tray/autostart, automatic companion updates, Firefox, other platforms and RAG/OCR remain follow-ups. They should not delay this submission. Current manual MCP setup and supported environment must remain clear.
