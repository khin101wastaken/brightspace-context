# v0.9.2 encrypted-storage candidate

Prepared November 5, 2026. This candidate replaces the existing draft package when live acceptance and the planned mock-LMS reviewer demo are ready. The draft item remains `iadmhandkbomngnaplppiopojmfkcodi`; no replacement ZIP has been uploaded or submitted by this workflow.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `BrightspaceContext-0.9.2-chrome-web-store.zip` | 100410 | `cc5a43f7ac5d59f65120688ea75d7bbd289faa0a7d6bc6eab2301e0f861b0bc1` |
| `BrightspaceContext-0.9.2-windows-x64-setup.exe` | 25744534 | `31be6ae18f67d24b8e228b405696f5d25e7136e53125dccd08306ee4b9f0e230` |

The ZIP has 32 entries. Browser assets match source and the Windows payload byte-for-byte; companion/MCP sources match their packaged copies. No extension permissions or runtime dependencies were added. The master key is generated on the user's computer, never during packaging.

Verification: 128 source tests pass, with a final focused native-vault/startup check after cleanup changes; syntax and local bundle checks pass. Packaged-runtime checks use bundled Node 22.23.4. Isolated installer acceptance verifies the v0.9.1-to-v0.9.2 migration, retained pairing/catalog/pending requests, identical original document bytes, one resumed browser fetch, cache hits, shortcuts and encrypted data retention after uninstall. These checks use synthetic data; the user's installed app and actual cache have not been changed.

Persistent companion data uses authenticated encryption and a Windows-account-protected key. Browser catalogs are encrypted, with live keys/credentials in session memory. Normal MCP retrieval returns bytes/resource links without a plaintext path. `export_document` is a separately enabled, explicit compatibility option that creates temporary **unencrypted** copies; ordinary Downloads remain separate readable files. See [ENCRYPTED-STORAGE.md](../docs/ENCRYPTED-STORAGE.md) for migration, recovery, export lifetime and threat-model limits.

Next: live browser-restart/unlock and actual desktop-client resource/export reading acceptance, then the local mock-LMS reviewer demo. Store approval remains Google's decision. Update instructions: [UPDATE-0.9.2.md](UPDATE-0.9.2.md).
