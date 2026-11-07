Current replacement instructions: see [UPDATE-0.9.3.md](UPDATE-0.9.3.md). The existing draft already exists; use its package-update action after final live acceptance. The first-upload notes below are historical.

# First Chrome Web Store upload: v0.9.1

The upload ZIP and all listing assets are grouped locally in `dist/chrome-web-store-0.9.1/`. Uploading a ZIP creates an editable item; it does not publish it.

1. In your developer account, check publisher name **Khin Aung**, the verified contact email, and two-step verification. The public support email is **khinaungwrk@gmail.com**.
2. Before final submission, test the final extracted ZIP and matching installer in standalone Chrome, preferably a separate test profile. Sign into NYU yourself, pair, sync one semester, search notes/filenames, download one file, retrieve an uncached document through the actual desktop host, repeat for a cache hit, and restart. With Resources closed, ask the connected model to discover semesters and resync one using the new tools. Source and packaged-runtime tests pass; this final live acceptance remains separate.
3. In the developer dashboard choose **Add new item → Choose file → Upload**. Select **BrightspaceContext-0.9.1-chrome-web-store.zip**. Do not upload the Windows EXE, the entire repository, the upload-packet folder or a ZIP of that folder. Confirm package version **0.9.1**.
4. In **Store listing**, use the name/short description imported from the manifest. Paste the long description from `SUBMISSION.md`. Choose English and the appropriate education category. Add `icon-128.png` if requested and the four numbered JPEG screenshots in order, including `04-popup.jpg`. Small/marquee promotional images are optional. Use the public setup page for homepage/support URL, the support email above, and the public privacy policy.
5. In **Privacy practices**, paste the single purpose and each permission justification from `SUBMISSION.md`. Use `privacy-answers.md` for data handling and remote code. Select **No remote code**. Disclose local website/course content and the local pairing credential; do not claim the product handles no user data. Read each certification before accepting it.
6. In **Test instructions**, paste `reviewer-instructions.md`. It honestly states that no NYU test account has been supplied. Reviewers are not automatically entitled to NYU access. The public synthetic walkthrough supplements the instructions; it does not promise approval or provide live school access. If Google requests access, resolve that request using an authorized arrangement.
7. In **Distribution**, select **Free** and **Unlisted** for the initial pilot, with your intended regions. Anyone with an unlisted link can install it after approval; unlisted extensions still undergo review.
8. Save the draft and record its assigned item ID/listing URL. Share that URL with the maintainer so the actual store install link can replace the current manual-install instructions when appropriate. Creating a draft before this wiring is expected.
9. Review the dashboard's remaining warnings and the final live-test results. Then choose **Submit for Review**. For the first release, uncheck automatic publication after approval so the final store/install links can be verified before manual publication. Approval is not guaranteed; monitor the account's review notices. Google currently allows 30 days to publish an approved staged submission before it returns to draft.
10. After approval/publication, install the store copy in the test profile and pair it explicitly. Confirm catalog sync and retrieval with that copy, then distribute its actual install link. Remove/disable duplicate development workers when switching the same profile to the store copy.

Official documentation checked November 5, 2026:

- https://developer.chrome.com/docs/webstore/publish
- https://developer.chrome.com/docs/webstore/images
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions
- https://developer.chrome.com/docs/webstore/cws-dashboard-distribution
