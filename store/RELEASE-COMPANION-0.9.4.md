# Companion 0.9.4: concise terminal logging

Published Windows companion patch with the unchanged Chrome extension 0.9.3. No new extension ZIP or Chrome draft update is required for this companion-only fix.

Installer: BrightspaceContext-0.9.4-windows-x64-setup.exe (25810233 bytes). SHA-256: 8add87e906381e7134fb26c04473749e0db3768fc1f4227af99c852a188ba3c1.

The public setup page now selects 0.9.4. Close the companion and stop its MCP connection before installing; reopen/restart afterward. Installation location, encrypted cache, pairing and pending requests are retained. The isolated 0.9.3-to-0.9.4 upgrade and packaged-runtime checks passed. The actual user installation/cache were not changed during testing.

Runtime source: be5ea5a0022d7ec6bc693c5a1f7fee01750af8d7. The payload records companion 0.9.4 and extension 0.9.3 separately. Source, bundled extension and the existing Chrome ZIP match byte-for-byte; old 0.9.3 installer/checksum files are unchanged.

Normal logs show short status lines, NYU/Demo labels, sync totals, cache outcomes and actionable warnings. Queue/claim/miss/ready chatter, IDs and timings remain in verbose mode. Credential/content redaction and silent idle polling remain covered by tests.

Site version 8, source 90b04155128aa5150fc99227da57050ff8154f6b. The public EXE hash matches the tested artifact. Setup: https://brightspace-context.khin101.chatgpt.site/setup/ . Local detailed record: dist/BrightspaceContext-0.9.4-release-record.json.

The frozen extension's versioned direct companion-download link still offers 0.9.3; use the current setup page for companion patch updates. Existing versioned URLs stay available.
