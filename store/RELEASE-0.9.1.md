# v0.9.1 submission candidate

Prepared November 5, 2026. No Chrome Web Store item has been uploaded or submitted yet. Earlier v0.9.0 artifacts predate the final sync-ring changes; use v0.9.1.

| Artifact | SHA-256 |
| --- | --- |
| `BrightspaceContext-0.9.1-chrome-web-store.zip` | `e2f8d9f9394a2219864c43edcc7d30797385eadb91708d75e537bece497f9a1f` |
| `BrightspaceContext-0.9.1-windows-x64-setup.exe` | `2b5324e5bbc5e4d865a2383f8d23dbe7057662f7d88a6d29e627cd598a284f6f` |

The extension ZIP has 31 entries and is 96,736 bytes. Its root manifest declares v0.9.1. The browser assets match the source and installer payload byte-for-byte; companion/MCP sources match their packaged copies too. No course catalog, credentials, runtime data, synthetic preview shim, Node runtime or companion code is included in the browser ZIP.

Verification: 115 source tests pass; syntax and local browser bundle checks pass. The final packaged-runtime smoke check covers startup/pairing, PDF/PPTX/DOCX original bytes, module notes, catalog-sync tools/discovery and restart. An isolated v0.9.0-to-v0.9.1 upgrade preserves pairing/cache/catalog/queue, completes retained retrieval once, and retains data after uninstall. The public installer was downloaded and its SHA-256 matched the tested EXE.

Public documentation/installer: https://brightspace-context.khin101.chatgpt.site/setup/ . Public synthetic reviewer walkthrough: https://brightspace-context.khin101.chatgpt.site/review/ . Site source checkpoint: `484cf63335e2beb4fa98fe66c5ad0490266074c5`, public site version 5.

Still pending: final standalone Chrome/NYU and actual-client acceptance, the dashboard draft and review. No NYU reviewer/test account is arranged. The listing and instructions disclose that limitation. Automated original-file transport checks do not establish compatibility with every client's file reader.

The grouped local upload packet is `dist/chrome-web-store-0.9.1/`. Upload only its extension ZIP to the Package field; use its other files for the corresponding listing/privacy/test fields. See [UPLOAD-STEPS.md](UPLOAD-STEPS.md).
