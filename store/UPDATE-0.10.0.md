# Submit Brightspace Context 0.10.0 beta

Use the [existing Chrome Web Store draft](https://chrome.google.com/webstore/devconsole/items/iadmhandkbomngnaplppiopojmfkcodi) for **Brightspace Catalog (NYU Prototype)**. The Windows companion is a separate download. The Chrome package is ready for manual upload.

## Package

- Upload `dist/BrightspaceContext-0.10.0-chrome-web-store.zip` in the draft's **Package** tab. Confirm manifest version **0.10.0** and display version **0.10.0 beta**.
- ZIP SHA-256 `b75177fdfbbcc222f2087727cd23120574fa27ebc5ff03e11b21088ba1f02a75`.
- Companion SHA-256 `d72d47e691e897d99d15a4a32e7a723d0ec64069cfb02bba02029f99a8685bb3`. The [public setup guide](https://brightspace-context.khin101.chatgpt.site/setup/) must offer that installer before review.
- The updated Chrome ZIP includes Hosted demo. Use this ZIP for the review package. The separate Windows installer was built from `da7a5dd792c0d879a564c02d272bf16882fc53b0` and its bundled extension includes Local demo. Its packaged MCP smoke test and isolated 0.9.4 upgrade passed. The 140 source tests also passed with the hosted changes.

## Complete the dashboard

1. **Store listing.** Use the description in [SUBMISSION.md](SUBMISSION.md) and the [setup page](https://brightspace-context.khin101.chatgpt.site/setup/) as the website. Confirm English, Education and the publisher/support details. Keep the existing four numbered [screenshots](assets/screenshots/) if already uploaded, including `04-popup.jpg`, the actual popup capture. Use `extension/icons/icon-128.png` if the dashboard asks for an icon.
2. **Privacy.** Use the single purpose and permission justifications in [SUBMISSION.md](SUBMISSION.md). Select No remote code. Review the website content and authentication information disclosures in [privacy-answers.md](privacy-answers.md) and check the certifications against actual behavior. Use the [public privacy policy](https://brightspace-context.khin101.chatgpt.site/) URL.
3. **Test instructions.** Leave the username and password fields blank. Paste [reviewer-instructions-500.txt](reviewer-instructions-500.txt) into Additional instructions. Hosted demo tests sync, search, and downloads directly in the installed extension without the companion. The [full walkthrough](https://brightspace-context.khin101.chatgpt.site/review/) also covers Local demo for pairing, cache reuse, expired access and optional MCP text reading. Live NYU testing requires institutional authorization.
4. **Distribution.** Choose Free of charge and Unlisted for the initial pilot. Confirm the intended regions and save each tab.

## Review and publish

Submit for Review with **Publish automatically** unchecked. After approval, use **Publish** within the dashboard's staged-submission window, which Google currently documents as up to 30 days. Install from the real listing in Chrome, pair that store copy, and run one demo sync and retrieval before sharing the install link. Update the setup page with the live store link once verified. [Google’s publishing guide](https://developer.chrome.com/docs/webstore/publish)
