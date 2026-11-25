# macOS installer preview

The pilot targets Apple silicon and macOS 13 or later. The app bundles Node, the existing companion and MCP server, and an unpacked extension copy for development. Chrome and Codex connect through the same local pairing and registration flow as on Windows.

## Build and verify

On an Apple silicon Mac with Xcode command line tools and native Node 22 or later, run:

```sh
npm ci
npm run build:macos
npm run test:macos
```

The builder checks the downloaded Node runtime against the pinned SHA-256, compiles the menu bar app and Keychain helper, and creates `dist/BrightspaceContext-<version>-macos-arm64.dmg` and its checksum. It uses the same app-source allowlist as Windows. Build metadata is in `dist/latest-macos-build.json`. The GitHub workflow runs the same build and smoke test on Apple silicon.

The smoke test mounts the image, copies the app to a temporary location containing spaces, checks signatures, then starts the bundled companion and MCP server. It uses a temporary Keychain, cache and Codex config. It verifies encryption, pairing, startup and shutdown, restart persistence and PDF text reading using fictional data. For the pilot, also check on a separate Mac that Finder installation and opening work, the panel looks right in both appearances, Chrome can pair, and Codex can read an uncached NYU file. Test the oldest macOS version you intend to advertise.

## Try the app

1. Open the disk image, drag **Brightspace Context** to **Applications**, and open the installed copy.
2. Look for the document icon in the menu bar. The pairing panel stays solid for three seconds, then fades over ten seconds. The pointer and keyboard keep it visible. Use **Show pairing code** to reopen it or **Setup guide** for the bundled instructions.
3. Install the Chrome Web Store extension and sign into Brightspace. For features ahead of that release, load the bundled `Contents/Resources/app/extension` directory as an unpacked extension. Pair the copy you use and keep a single Brightspace extension active.
4. In the menu bar, choose **Open dashboard**, click **Connect to Codex**, then quit and reopen Codex. The button adds the bundled executable and shared cache path to your Codex config. An existing conflicting entry is preserved for you to review.
5. Sync a semester in Chrome and ask Codex to retrieve and read a course file. Use **Quit Brightspace Context** from the menu bar to stop the companion.

## Storage and signing

The default cache is `~/Library/Application Support/Brightspace Context/cache`. The random master key lives in your login Keychain and the cache holds a reference to it. If the companion reports a Keychain error, unlock your login Keychain and choose **Start companion** from the menu. That action lets macOS ask for Keychain access if needed. Preserve the original cache and Keychain item for recovery. A development rebuild may change the helper's ad hoc signature and prompt again. Moving a Windows cache to Mac requires the original Windows key protection, so the Mac setup starts with a fresh cache and pairing.

The default build is an ad hoc preview for development. For a public download, configure a Developer ID Application signing identity and a `notarytool` Keychain profile, then build with `BRIGHTSPACE_MAC_SIGN_IDENTITY` and `BRIGHTSPACE_MAC_NOTARY_PROFILE`. The build signs the nested executables and app, signs the disk image, waits for notarization, staples and validates the ticket, then writes the final checksum. Verify the resulting download on a second Mac before publishing. [Apple distribution guidance](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution)

Deleting the app from Applications leaves the encrypted cache, Keychain item and Codex registration. To stop using it in Codex, remove the `brightspace-context` entry from MCP servers. Remove the app data and Keychain items separately only when you want to discard the local cache.
