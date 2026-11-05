# Windows installer preview

This first packaging slice produces an offline Windows 10/11 x64 installer. End users need neither Node, npm, a source checkout nor shell commands. Installation is per-user with no administrator prompt. Mac/Linux packages, signing, tray controls, automatic startup, automatic updates, and guided verification remain unfinished milestones.

## Build

On a Windows x64 build machine:

1. Install Node 22+ and run `npm ci` in this repository.
2. Install the official [Inno Setup compiler](https://jrsoftware.org/isdl.php). Version 7.1.1 is tested. Follow its license terms for your intended use.
3. Set `BRIGHTSPACE_ISCC` to the absolute `ISCC.exe` path, or place the compiler under the ignored `.cache/build-tools/inno` directory.
4. Run `npm run build:windows` (`npm.cmd` in PowerShell).
5. Run `npm run test:installer` to check the staged payload with its own bundled runtime.

Example compiler selection in PowerShell:

```powershell
$env:BRIGHTSPACE_ISCC = 'C:\Program Files\Inno Setup 7\ISCC.exe'
npm.cmd run build:windows
npm.cmd run test:installer
```

The build downloads the exact Node 22.23.4 Windows x64 ZIP from nodejs.org, checks its pinned SHA-256, and includes only `node.exe` and its third-party license notices. Version/checksum pins live in [build-config.json](../packaging/windows/build-config.json); update them together against official release checksums. A cached archive is rechecked on every build. No developer-machine Node executable is redistributed.

The application payload uses an explicit source allowlist: extension, companion, MCP, package manifests and the project's MIT license. Production dependencies are installed in fresh staging with `npm ci --omit=dev --ignore-scripts`; dependency licenses are retained. It never copies the workspace wholesale, existing `node_modules`, profiles, `.cache`, pairing, catalogs, logs or course files. Symlinks are rejected during payload inventory. The generated `PAYLOAD.json` records every packaged file's size and SHA-256. These hashes detect changes; they do not replace code signing.

Build staging and downloaded tools stay under `.cache`; outputs stay in ignored `dist`:

- `BrightspaceContext-<version>-windows-x64-setup.exe`
- Matching `.exe.sha256`
- `latest-build.json` pointing to the staged payload for local smoke testing (not a distribution file)

The installer is an unsigned preview. Do not describe it as reviewed or production-ready.

## User flow

1. Run the installer. It installs under `%LOCALAPPDATA%\Programs\Brightspace Context` and adds Start menu shortcuts. The optional desktop shortcut is unchecked by default.
2. Open the bundled **Setup guide**. It derives the correct installed paths and displays the extension directory and desktop MCP command/argument, including a JSON example.
3. Start **Brightspace Context Companion** from the Start menu. Its window shows the pairing code. Keep it open; close it to stop. A second instance cannot bind the same companion port.
4. Manually load the installed `app\extension` directory in Chrome Developer mode, sign into Brightspace, and pair normally. The installer does not force-install extensions or change browser policy.
5. Add the installed STDIO command to a supported local MCP client. The installer does not edit client settings. Sync a semester and verify one PDF retrieval/read.

The launcher uses its own relative paths and bundled runtime, so it works from installation paths containing spaces and does not depend on `node` being on PATH. Source-based development remains supported separately.

Version 0.8.4 adds timestamped [terminal diagnostics](COMPANION-LOGGING.md) and a **Troubleshooting → Companion (verbose logs)** Start menu shortcut. Stop the normal instance before using the verbose shortcut. A store-based extension onboarding flow is described in [Extension distribution](EXTENSION-DISTRIBUTION.md); the preview still requires manual loading until a listing is published.

## Update and removal

Close the companion and stop its MCP connection before running a newer installer, so neither process holds the bundled runtime open. The stable application ID and default installation directory allow in-place replacement. Windows Restart Manager can identify installed application files that are still in use; automatic restart is disabled. Reload the Chrome extension and restart the desktop MCP connection after updating. Dependency-set changes, interrupted installs, rollback and data-schema migrations still need additional release acceptance testing.

Uninstall removes installed application files and shortcuts. It preserves `%USERPROFILE%\BrightspaceContext\cache`, which contains pairing, catalog, queue and PDF data. No deletion rule targets that directory. Remove the Chrome extension and desktop MCP registration separately. For explicit data erasure, stop the companion, then delete the cache directory. No automatic startup registration is created.

Version 0.8.3 changes the Windows cache default from `%LOCALAPPDATA%\BrightspaceContext\cache` to `%USERPROFILE%\BrightspaceContext\cache`. Desktop tool runtimes can see redirected AppData directories, causing the companion and MCP to read different pairings and indexes despite apparently identical displayed paths. The home-relative default avoids reliance on AppData. `BRIGHTSPACE_CACHE_DIR` can explicitly select the same absolute folder for both processes. Older cache directories are not automatically deleted, merged or overwritten. For an existing installation, stop both clients, back up the old cache, copy it into an empty destination, update both processes' path settings and restart them. Re-pair once if the browser's saved credentials differ. Do not copy over a running or populated destination.

## Verification

`npm run test:installer` checks file inventory and bundled Node version, starts the actual packaged companion on an ephemeral port with an isolated temporary cache, pairs a synthetic extension origin, stores a synthetic PDF, launches the packaged MCP server, verifies returned PDF bytes, restarts the companion and checks pairing/cache persistence. It does not use NYU credentials or your real cache. Passing an installed directory tests that installation instead:

```powershell
npm.cmd run test:installer -- 'C:\path with spaces\Brightspace Context'
```

The automated smoke does not prove Chrome installation, an actual model's PDF reading, Windows reboot behavior, a fresh account with no developer tools, or signed distribution. Those remain manual release checks. The optional GitHub Actions workflow builds and smoke-tests an unsigned artifact on Windows; it does not publish a release.

### Upgrade acceptance

Run `npm run test:upgrade` on Windows after building the current payload and retaining a previous version's staged payload. It selects the most recent lower version automatically, or accepts explicit old/new payload directories:

```powershell
npm.cmd run test:upgrade -- 'C:\old payload' 'C:\new payload'
```

The test compiles the production installer template twice with a unique test application ID, a unique Start menu group and a guarded fallback directory. Test compression is disabled for speed. All files, cache data and shortcuts belong to the fixture; it does not upgrade the user's real installation. Group isolation is compiled into the fixture, rather than relying on a runtime `/GROUP` override. Production builds retain the fixed application ID, normal group/directory and LZMA2 compression.

It installs the older payload into a path containing spaces, seeds synthetic pairing/catalog/PDF/queued-request state, closes both old processes, and runs the newer installer **without `/DIR`**. It checks that the previous directory was reused and every payload file matches its new inventory. The upgraded MCP must read the original PDF with the same fetch timestamp and resume the old queued request through the upgraded packaged browser worker exactly once. It also validates the new verbose shortcut, DEBUG output, cache hits, and uninstall-after-upgrade data retention. No NYU account or school file is used.

The result is stored in ignored `.cache/upgrade-tests/latest-report.json`. Failed fixture logs are retained for diagnosis after its test application is uninstalled. The CI packaging job runs the fresh-payload smoke; upgrade acceptance additionally requires access to the previous staged payload.

Verified locally on November 3, 2026: the v0.8.3 → v0.8.4 acceptance command exited successfully with all six checks passing, including previous-directory reuse, retained state, one resumed PDF fetch, cache reuse, the verbose shortcut and uninstall/data retention. The final production payload smoke and all 62 regression tests also passed. This does not claim automatic migration from the legacy v0.8.2 cache path or complete coverage of interrupted upgrades.

Local verification on November 3, 2026: the 25,678,104-byte installer compiled successfully, installed silently into an isolated directory containing spaces, and passed the packaged-runtime smoke against the installed files, including the actual launcher command. Its own uninstaller then removed the test application successfully. The existing development companion remained listening and its pairing file remained present. All 57 regression tests and JavaScript syntax checks passed. No fresh-account or reboot acceptance is claimed.

The subsequent live 0.8.2 upgrade check exposed an AppData view mismatch: Explorer showed a recent pairing and the installed companion reported an empty cache, while the tool runtime saw an older pairing and four cached PDFs at the displayed legacy path. Version 0.8.3 uses the shared home-relative cache, adds two path regression tests, and passes all 59 checks plus the rebuilt payload smoke. The original cache was backed up and copied into the new location without overwriting the legacy directory. A fresh MCP client using the installed runtime then retrieved Sella's 24-page double-integrals lecture through the paired Chrome worker; repeating it returned the same verified file from cache with the original fetch timestamp. A previously running MCP client must be restarted to load its changed directory configuration. Restarting MCP is separate from restarting the companion.

After the desktop MCP connection was restarted, this chat's attached `get_cached_document` and `request_document` tools also succeeded against that lecture; the latter returned `source: cache` with no new request. The PDF was opened and its handwritten first page visually inspected. The shared cache then contained the four recovered PDFs plus the newly fetched lecture.

Version 0.8.4 adds diagnostic logging and passes all 62 regression checks. Its packaged smoke also exercises both normal and `--debug` launchers from paths containing spaces, verifies DEBUG request-timing output, and repeats pairing, PDF/MCP byte equality and restart persistence with an isolated synthetic cache.

## Platform plan

The Node companion, extension and MCP server remain portable JavaScript. Packaging and launch UX are platform-specific. Future macOS and Linux installers should reuse those components and provide their own runtime, installation paths, signing/notarization and startup integration. A single download page can select the appropriate OS build; there is no universal native installer executable.
