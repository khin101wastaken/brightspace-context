# Extension installation without Developer mode

The intended consumer flow is:

1. Install/open the companion.
2. Choose a supported browser in onboarding.
3. Open the extension's published store page in that browser.
4. Approve the browser's Add extension prompt.
5. Enter the companion's pairing code, sign into Brightspace, and verify the connection.

This removes manual extension-folder selection and Developer mode from the published product. Browser selection is a launcher convenience; the browser still owns extension permission approval and profile selection. The current preview still loads an unpacked extension because no store listing has been published.

## Chrome

Chrome's [external installation documentation](https://developer.chrome.com/docs/extensions/how-to/distribute/install-extensions) supports registry-based installation requests on Windows and preferences files on macOS/Linux. On Windows/macOS, those methods point to a Chrome Web Store extension, and the user is prompted to enable it. Local CRX external installation is not supported on those platforms. Enterprise administrators have policy-based deployment options, but that is a separate managed-device route.

For this per-user companion, open the store listing directly. That fits the existing installation without administrator setup or device-management configuration. A browser chooser should use a real published listing URL and explicit browser selection; it should not claim that opening the page means installation succeeded. The already implemented paired worker connection is the evidence that setup has reached a working browser.

An [unlisted Chrome Web Store item](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution) can be installed by anyone with its URL and is suitable for a small pilot. Unlisted, public and private visibility all go through the same policy review. A private trusted-tester listing is another option if access needs to be restricted. Unlisted does not mean private.

## Edge and other browsers

Edge supports its own [store and alternative distribution methods](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/alternate-distribution-options). Its native store listing can be another onboarding destination after Edge compatibility has been verified. Other Chromium browsers need explicit validation rather than assuming identical installation behavior. Firefox remains a separate port.

## Work needed before the browser chooser can complete installation

- Prepare the extension listing, icons/screenshots, privacy disclosure and permission explanations.
- Publish a pilot listing through the developer account and complete review.
- Record the actual listing URL and stable store extension ID.
- Add the first-run browser chooser and Open extension store action to the companion UI.
- Verify the full flow in a fresh browser profile: install, pairing, semester sync, one uncached PDF, repeat cache hit and restart.

Moving from an unpacked extension to a store extension can change its ID and Chrome storage. Pilot users should expect to pair the store copy and sync their catalog. The companion's original PDFs remain in its cache; the active paired browser origin still determines which extension can retrieve documents.

No browser policies, external-extension registry entries or store submissions are created by this implementation. The store publication and first-run chooser remain the next distribution work; runtime diagnostic logging is implemented separately.
