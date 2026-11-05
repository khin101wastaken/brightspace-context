# Pinned priority: Chrome Web Store submission

Updated November 5, 2026. Objective: submit an unlisted local Windows/NYU pilot once the essentials below are ready. The extension has not been uploaded, reviewed or approved.

## Frozen release candidate: v0.8.9

The submission candidate packages the current source, search refinements, GitHub links and MIT license together. The public download remains v0.8.8 until the candidate passes acceptance. Follow [the candidate acceptance steps](RELEASE-0.8.9.md); retain its source commit and artifact hashes when recording results.

- [x] 83 source tests pass; local bundles match their sources.
- [x] Build and verify the matching v0.8.9 extension ZIP and Windows installer; their packaged browser files are byte-identical.
- [x] Complete isolated packaged-runtime and v0.8.8-to-v0.8.9 upgrade checks, including retained state, one resumed request, shortcuts and uninstall retention.
- [ ] Complete fresh-profile/live document-reading acceptance.
- [ ] Publish the accepted installer and update reviewer instructions/download links.

## Already prepared

- [x] v0.8.8 extension ZIP with local bundles, icons and dependency/integrity checks.
- [x] v0.8.8 Windows companion installer and setup guide.
- [x] Public privacy policy covering PDF/PPTX/DOCX handling.
- [x] Publisher name, support email, draft listing and permission explanations.
- [x] 83 local tests and packaged-runtime checks for supported file transport and restart persistence.

## Finish before submission

- [ ] Register/verify the Chrome developer account and complete required dashboard declarations.
- [x] Public setup and companion download URLs: https://brightspace-context.khin101.chatgpt.site/setup/ . The public v0.8.8 installer and checksum were verified against the tested build.
- [ ] Capture accurate store screenshots using synthetic or appropriately cleared material; finalize listing text and privacy/permission answers for the actual v0.8.8 behavior.
- [ ] Finalize legitimate reviewer access and complete `store/reviewer-instructions.md`. NYU-only live features require authorized access. A synthetic demonstration and walkthrough can supplement testing but must be clearly identified and cannot be assumed to replace any reviewer access requirement.
- [ ] Check the extracted release ZIP and installed companion in a fresh Chrome profile: pairing, semester hierarchy, module notes, download, on-demand retrieval, cache repeat and restart. Verify actual supported host file reading, including the real PPTX/DOCX path when advertised.
- [ ] Save the tested source checkpoint and ensure the submitted ZIP, installer and instructions correspond to that release.
- [ ] Upload the ZIP, select the intended pilot visibility, complete the dashboard and submit for review. Record the resulting listing URL and review outcome.

## Follow-up improvements

Simpler ChatGPT MCP registration, a Claude MCPB, tray/autostart, automatic companion updates, Firefox, other platforms and RAG/OCR do not need to be implemented before this first submission. Clearly document the current manual MCP setup and supported environment. Hosted course-data deployment remains deferred.

Sources of release details: `store/SUBMISSION.md`, `store/reviewer-instructions.md`, `docs/roadmap.json`.
