# Local demo release: v0.9.3

Runtime source: `f2563b7b27a1efe41d14efb572551f65d71e4c98` on `codex/demo-lms`. Publication-only documentation can follow that checkpoint. The existing Chrome item `iadmhandkbomngnaplppiopojmfkcodi` remains a draft with 0.9.1; no replacement upload or submission was performed.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| BrightspaceContext-0.9.3-chrome-web-store.zip | 104143 | e275401774ec97bd98221e3819fd124f29d538fdfd63924e9029e9f740a4053b |
| BrightspaceContext-0.9.3-windows-x64-setup.exe | 25806760 | a69ca37127d62218b3ccfe65dd8f2454f26a3a9bab368aa09360b6c3c2c99deb |

The extension archive has 34 allowlisted entries. Its browser files and the installed payload match source byte-for-byte; the companion/MCP source and generated fictional files match the staged payload. No permissions or production dependencies were added. Original sample PDFs are marked binary to preserve cross-reference offsets across Windows Git checkouts. The installer builder normalizes setup-page newlines before calculating the inline-script CSP hash.

Validation: all 130 source tests pass; syntax and generated-bundle checks pass. Tests use the real companion HTTP server, background workers, encrypted storage and separate STDIO MCP process. They cover both-course sync, module-detail fallback, original PDF/PPTX/DOCX bytes, uncached fetch/repeat hit, mutation/resync, expired access/retry, cached reads while expired, cross-origin web/API boundaries, encrypted browser/disk metadata and identical-ID namespace collisions. An isolated upgrade proves 0.9.2 rejects the new demo path without modifying its real catalog.

Final bundled-Node 22.23.4 smoke checks pass, including shipped demo website/assets, provider schema and separate discovery queue. Isolated 0.9.2-to-0.9.3 install/upgrade checks preserve the installation directory, encrypted pairing, cached original bytes/fetch times, metadata and queued requests; the upgraded worker completes the pending fetch once. Uninstall preserves encrypted data. These checks did not update the user's real installation or cache.

The local demo website's controls and outline were checked in the browser, and the source selector fits the existing popup/settings layout in the synthetic UI preview. Standalone Chrome/installed-app acceptance and original-file reading by the actual desktop host remain user checks. Demo fixtures do not verify NYU authentication or real endpoint compatibility.

Public Site version 7, source `e3da4e0700705ed6592e8e773f663fbe13bbf627`, publishes matching setup/reviewer instructions and the installer. The public EXE download's SHA-256 matches the tested artifact. Setup: https://brightspace-context.khin101.chatgpt.site/setup/ . Review/demo guide: https://brightspace-context.khin101.chatgpt.site/review/ .

The local upload packet is `dist/chrome-web-store-0.9.3/`; full local record is `dist/BrightspaceContext-0.9.3-release-record.json`. Upload only the extension ZIP after live acceptance. See `UPDATE-0.9.3.md`; `reviewer-instructions-500.txt` fits the dashboard field. Earlier frozen artifacts remain available. Chrome Web Store approval is not claimed.
