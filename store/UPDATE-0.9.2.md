# v0.9.2 encrypted-storage candidate

This is an update to the existing draft **iadmhandkbomngnaplppiopojmfkcodi**, not a new store item. The uploaded draft still contains v0.9.1. Finish live acceptance and the planned reviewer demo before final submission.

## Local acceptance

1. Stop the old companion and its desktop MCP connection. Install the matching v0.9.2 candidate. Reload the existing Chrome extension and restart MCP; its configured paths can remain unchanged.
2. Start the updated companion using the same cache location. Its first start migrates recognized legacy files to `.vault` files using a Windows-account-protected key. Existing pairing, catalogs, document bytes and pending requests should remain. Preserve the key/cache/Windows profile if any migration or unlock error appears.
3. Open extension Settings. Storage should report protected saved catalogs. Close and reopen Chrome with the companion running: the encrypted credential should restore the connection without another pairing code.
4. Ask the desktop client to retrieve one cached and one uncached document and read the MCP resource bytes. Normal results have no `localPath`. Unsupported client resource readers must report that limit honestly.
5. For a client requiring local paths, explicitly enable **Settings → Temporary file exports**, then request `export_document` for one ID with `acknowledgePlaintext:true`. Verify its readable bytes and expiration. These copies are unencrypted, disabled by default, and removed on expiry/normal shutdown; a crash can leave them until next start. Disabling exports removes current copies. Ordinary Downloads remain separate.
6. Check semester sync, nested modules, notes search, individual download, cache hit and companion restart. The mock reviewer website is the next objective; it is not included yet.

## Dashboard update when the combined candidate is ready

Open the existing item's **Package** tab and use its upload/replace action for the new ZIP. Keep the same item ID, listing and distribution settings. The data categories and permission set are unchanged. Update description and test instructions to explain the resource-byte default, opt-in temporary exports and actual reviewer demo when available. Do not claim every exported or client-managed copy is encrypted.
