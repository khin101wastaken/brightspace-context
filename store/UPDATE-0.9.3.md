# Replace the existing draft with v0.9.3

Draft ID: `iadmhandkbomngnaplppiopojmfkcodi`. Do not create a second item. This update adds the all-user local demo and retains encrypted local storage. It has not been uploaded or submitted automatically.

1. Close the companion and stop/restart the desktop MCP connection around the update. Install companion `BrightspaceContext-0.9.4-windows-x64-setup.exe` (the compatible logging patch; extension remains 0.9.3) from the public setup page. Existing real cache and pairing stay in their current location; do not delete or re-point the cache. The installed app remains Windows x64 only.
2. Reload the extension from the folder you actually use. The development copy is still the workspace's `extension` directory; the installer also includes a copy under `app/extension`. Use one worker identity/profile rather than enabling duplicate copies.
3. Start the updated companion, unlock/pair if needed and restart the MCP connection so the new provider schemas are available.
4. Choose Settings → Local demo, open Resources and sync Demo 2026 Fall. Test nested notes/search, file download, on-demand retrieval and repeat cache hit. Open `http://127.0.0.1:47653/demo/` for a new reading and simulated expired access. MCP demo calls need `provider: "demo"` on every follow-up. Read file bytes before answering. Successful repeated catalog syncs are deduplicated for 30 seconds.
5. Restart Chrome/companion, check saved data, switch to NYU Brightspace and confirm your real library is still available. No real NYU session is needed for the fictional demo; real NYU acceptance remains distinct.
6. After that check, upload **only** `BrightspaceContext-0.9.3-chrome-web-store.zip` as the new package in the same draft. The EXE and upload-packet directory do not go into the extension ZIP field. Confirm version 0.9.3.
7. Saved listing/privacy/distribution fields can remain, reviewed against current `SUBMISSION.md`/`privacy-answers.md`. Add the local demo sentence to the long description if desired. Test instructions: leave school credentials blank and paste `reviewer-instructions-500.txt` (494 characters). The public `/review/` page contains complete steps.
8. Keep initial Free/Unlisted distribution if still intended. Review all dashboard warnings and submit manually when satisfied. A runnable demo helps test the local pipeline; Google may still request institutional access or other evidence.

Public setup: https://brightspace-context.khin101.chatgpt.site/setup/ . Working-demo guide: https://brightspace-context.khin101.chatgpt.site/review/ . The local demo itself runs on the reviewer's computer in the installed companion.
