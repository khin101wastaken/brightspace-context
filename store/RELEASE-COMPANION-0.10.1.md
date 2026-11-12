# Windows companion 0.10.1 beta

Released November 12, 2026. Compatible with Chrome extension 0.10.0.

- Run the companion from the taskbar tray with optional launch at sign-in.
- Open its dashboard to pair Chrome, register the MCP server in Codex, inspect or remove cached files, and cancel queued retrievals.
- Show the pairing code above the taskbar with a brief delay, a ten-second fade and hover to keep it visible.
- Open the hosted setup guide from the dashboard or tray menu. See the companion version in both places.
- Upgrade while preserving pairing, the encrypted cache and queued requests. Setup closes the installed tray and retains a matching Node runtime when an MCP process is using it.

Quit and reopen Codex after registering the connection or updating the companion. Download the unsigned Windows 10/11 x64 installer from the [setup guide](https://brightspace-context.khin101.chatgpt.site/setup/).

Validation passed: 144 automated tests, syntax checks, packaged-runtime smoke, and eight isolated upgrade checks from 0.10.0.18. Hosted download assembly and corrupted-part rejection passed.

Installer SHA-256: `c8c7e35b5d04296cc323b217fd375e8be5fce3fd953d1f1efb77beed47331283`.
