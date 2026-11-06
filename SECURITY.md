# Security reports

Email **khinaungwrk@gmail.com** with the subject **Brightspace Context security report** for suspected vulnerabilities. Please report privately before opening a public issue containing exploit details.

Include affected versions, a short description and reproduction steps using synthetic data where possible. Do not send school passwords, browser cookies, pairing tokens, course documents or complete private logs. There is no guaranteed response time or paid vulnerability program.

This is a preview. The extension uses the user's existing NYU session and a paired loopback companion. Starting with v0.9.2, persistent companion data uses authenticated encryption with a Windows-account-protected key; browser catalogs use encryption and decrypted session state. Normal MCP reads return bytes without a plaintext path. Separately enabled temporary exports and ordinary user downloads create readable local files. Older versions stored ordinary plaintext cache files; first-start migration and its limitations are described in [ENCRYPTED-STORAGE.md](docs/ENCRYPTED-STORAGE.md). This protection does not defeat malware running as the same Windows user or control copies made by an AI client. Account-switch isolation and some data-management controls remain unfinished. Use a single-account local setup while those boundaries are being completed.
