# Section 5E production device verification

## Status

**Started August 27, 2026 — live credential and real-device checks remain open.**

This checklist verifies the finished private-family authorization model in production. It replaces the older Editor-only checklist that predated owner bootstrap, protected device cookies, normal shared-plan device authorization, Viewer enforcement and revoked-credential cleanup.

The live checkbox tracker is frontend issue #25. Do not place a family key, raw invite/device credential, token hash or pepper in this document, GitHub, logs or screenshots.

## Non-retirement boundary

Section 5E does not authorize family-key retirement. `CASTLEWATCH_FAMILY_KEY` and the production `legacy_family_key_enabled` value remain configured and enabled. Any retirement option is a separate future decision requiring explicit user approval after Section 5 closes.

## Fixed production checkpoints

- backend `main`: `226f9f3ff776c0a48b12c9aa763cb140160b071c`;
- frontend `main`: `f591f5b140e5ca0654f04a1433963d7ba560bd71`;
- frontend: `https://castlewatch-frontend.vercel.app`;
- backend: `https://castlewatch-2027-production.up.railway.app`;
- governing backend contract: `docs/accounts_migration_contract.md`.

## Verified automated baseline

- both production heads remain unchanged from the finalized 5D checkpoint;
- the authoritative Railway and Vercel checks are green;
- production CastleWatch loads Railway data and reports **Backend connected**;
- Railway `/health` returns HTTP 200 with status `ok`;
- intentionally invalid family-key device-list, invite, bootstrap, shared-plan and Operations requests return unauthorized without mutation;
- an invalid invite is rejected without creating a device;
- selecting protected-device mode without a cookie returns `protected_credential_missing` and does not use a family key;
- the unused `/api/family-trip` direct proxy remains isolated and key-only with no in-repository caller; `/api/castlewatch-family-sync` is canonical.

## Required live verification

Use a trusted primary browser and a second real browser or phone. The secondary device must not contain the family key.

### A. Family-key recovery and owner bootstrap

1. Connect Shared Family Plan with the current family key through the trusted UI.
2. Confirm the shared plan loads and **Check access state** reports the family-key owner path.
3. Refresh Family devices and confirm the list contains safe metadata only.
4. Explicitly bootstrap one named production Owner device.
5. Confirm the credential is stored in the protected `Secure`, `HttpOnly`, `SameSite=Strict` cookie and no raw device token reaches browser JavaScript or persistent UI.
6. Reload and confirm the protected Owner credential persists.
7. Select the protected Owner credential and confirm owner access without family-key fallback.
8. Re-select family-key recovery and confirm it remains available.

### B. Owner shared-plan behavior

1. Read the current shared plan, history and one history version.
2. Download a backup.
3. Upload the same unmodified payload with the current expected version.
4. Confirm a new version is created while the itinerary and trip profile remain content-identical.
5. Restore the immediately previous content-identical version and confirm restore creates a new version without changing trip content.
6. Confirm guarded autosave remains off unless manually enabled.
7. Confirm Operations loads for Owner.
8. Confirm Owner can list devices and create Editor or Viewer invites.

### C. Editor on the second device

1. Create an Editor invite from the Owner path.
2. Confirm the invite token appears only in the immediate response and never in the device list.
3. Transfer the invite directly to the second device without posting or logging it.
4. Accept the invite and confirm no raw device token is displayed.
5. Reload and confirm the protected Editor credential persists.
6. Confirm Editor can read, write content-identically, read history, restore content-identically and open Operations.
7. Confirm Editor cannot list devices or create invites.
8. Rename the current Editor device through the protected self-rename control and confirm persistence.

### D. Viewer boundary

Revoke the Editor test device before reconnecting the same secondary browser through a fresh Viewer invite.

1. Accept a Viewer invite with no family key present.
2. Confirm Viewer can read the shared plan and history.
3. Confirm manual upload, guarded autosave, restore and Operations controls are unavailable.
4. Confirm Viewer cannot list devices, create invites or perform protected write/restore/Operations requests.
5. Rename the current Viewer device through the protected self-rename control and confirm persistence.
6. Confirm browser display metadata cannot override the server-verified Viewer role.

### E. Revoked-cookie-only denial

1. Leave the active protected Viewer credential and no family key on the secondary device.
2. Revoke it from the Owner browser through the inline confirmation.
3. Confirm the Owner list reports revoked status and a timestamp.
4. On the untouched secondary device, run **Check access state** or a manual shared-plan refresh.
5. Confirm the request receives the explicit revoked/rejected 401 state.
6. Confirm CastleWatch clears the protected cookie and safe local device metadata, records a disconnected selection and does not fall back to a family key.
7. Confirm revocation does not alter shared-plan content or history.

### F. Recovery and final state

1. Explicitly reconnect the trusted browser through family-key recovery.
2. Re-select and verify the protected Owner credential.
3. Leave at least one manually tested active Owner device in production.
4. Revoke any temporary Editor or Viewer device that remains active.
5. Confirm final device rows expose safe metadata only.
6. Recheck Railway health and the authoritative frontend Vercel deployment.
7. Confirm the October 9–16, 2027 trip, two-adult/two-child profile, no-park-hopping rule and **Keep / Swap / Wait / Review** control remain unchanged.

## Safety checks

- Family devices performs no automatic polling and sends no SMS/text delivery.
- No family-key disablement, removal or retirement control is present.
- Invite tokens appear only immediately after creation.
- Raw family keys, device tokens, invite tokens, token hashes and peppers never appear in GitHub, source, logs, screenshots or persistent UI.
- No dependency/runtime, schema, itinerary or reservation change is bundled into 5E.

## Pass criteria

Section 5E can close only when frontend issue #25 records all of the following:

- a production Owner device exists and is manually verified;
- family-key recovery remains enabled and verified;
- Owner and Editor normal shared-plan flows pass;
- Viewer read-only boundaries pass;
- self-rename and Owner-managed revocation pass;
- a revoked-cookie-only device loses access without hidden fallback;
- shared-plan version/history and trip invariants remain intact;
- Railway and the authoritative frontend Vercel deployment remain green;
- canonical closeout is reviewed, merged and deployed after explicit **Finalize Section 5E** approval.
