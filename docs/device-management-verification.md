# Section 5E production device verification

## Status

**Passed August 29, 2026 — production two-device verification is complete.**

Section 5E verified the finished private-family authorization model in production with a trusted Owner browser and a second real phone/browser that did not contain the family key. Frontend issue #25 is the live evidence tracker.

No family key, raw invite/device credential, token hash or pepper was recorded in this document, GitHub, logs or screenshots.

## Non-retirement boundary

Section 5E closeout does not authorize family-key retirement. `CASTLEWATCH_FAMILY_KEY` and the production `legacy_family_key_enabled` value remain configured and enabled. Any retirement option is a separate future decision requiring explicit user approval.

## Production checkpoints

- backend `main` at verification: `226f9f3ff776c0a48b12c9aa763cb140160b071c`;
- frontend `main` at verification: `f7b5ccbf38081ff044808899ef7c965c2e04e1cd`;
- frontend: `https://castlewatch-frontend.vercel.app`;
- backend: `https://castlewatch-2027-production.up.railway.app`;
- governing backend contract: `docs/accounts_migration_contract.md`.

The frontend verification head includes three narrow 5E support fixes:

- PR #42 / `fe964bec64f1d2071c899e2ea5d8bf3d79a1e949`: protected-device self-rename;
- PR #43 / `f87f5b761cb0cec7c74defad723a3790bf85a6fd`: explicit family-key recovery verification UI;
- PR #44 / `f7b5ccbf38081ff044808899ef7c965c2e04e1cd`: confirmed content-identical manual backup creation.

## Automated and service baseline

- the backend remained at the finalized 5D implementation head;
- the frontend passed all 111 tests and its production Next.js build at the 5E verification head;
- the authoritative Vercel status for the frontend verification head was successful;
- production CastleWatch loaded Railway data and reported **Backend connected**;
- Railway `/health` returned HTTP 200 with status `ok`;
- intentionally invalid family-key device-list, invite, bootstrap, shared-plan and Operations requests were rejected without mutation;
- an invalid invite was rejected without creating a device;
- protected-device mode without a cookie returned `protected_credential_missing` without family-key fallback;
- the unused `/api/family-trip` direct proxy remained isolated and key-only with no in-repository caller; `/api/castlewatch-family-sync` remained canonical.

## Production verification results

### A. Family-key recovery and Owner bootstrap — passed

- Family-key recovery connected explicitly and reported the family-key Owner path.
- The production device list exposed safe metadata only.
- The explicit confirmation created the protected Owner device `Ryan Brave Owner`.
- No raw Owner credential reached browser JavaScript, persistent UI or browser-readable storage.
- The protected Owner credential persisted across reloads and worked without family-key fallback.
- Family-key recovery remained available, was reselected successfully, and stayed enabled.

### B. Owner normal flow — passed

- Owner read the shared plan, history and historical versions.
- A content-identical manual backup created shared version 12 from version 11.
- Append-only restore verification created versions 13 and 14 without changing trip content.
- Guarded autosave remained off.
- Operations loaded normally for Owner.
- Owner device listing and Editor/Viewer invitation creation worked.

### C. Editor on the second device — passed

- A seven-day Editor invite was transferred directly and accepted without exposing a raw device credential.
- `Katie iPhone Editor` persisted in protected browser storage across reloads.
- Editor read the plan/history, opened Operations, created content-identical version 15 and restored version 14 as new version 16.
- Editor could not list devices or create invitations.
- Editor self-rename persisted.
- Owner subsequently revoked the temporary Editor device.

### D. Viewer boundary — passed

- A fresh Viewer invite connected the same secondary device without a family key.
- Viewer read the current plan and history.
- Upload, autosave, restore and Operations controls were unavailable; direct Operations access reported that Owner or Editor access was required.
- Viewer could not list devices, create invitations or perform protected write/restore/Operations requests.
- Renaming the display label to `Owner Label Test` did not change the server-verified Viewer role.

### E. Revoked-cookie-only denial — passed

- Owner revoked the active temporary Viewer through the confirmation flow.
- The Owner list showed the Viewer as revoked with a timestamp.
- The untouched secondary browser received the explicit rejected/revoked state on its next request.
- CastleWatch cleared the protected cookie and safe local device metadata, entered a disconnected state and did not select or use a family key.
- Shared-plan content and history were unchanged by revocation.

### F. Recovery and final production state — passed

- Family-key recovery and the protected Owner path were each explicitly reverified.
- `Ryan Brave Owner` remains the active production Owner.
- Temporary Editor and Viewer devices are revoked with timestamps.
- Final device rows expose safe metadata and token prefixes only.
- A deliberate trip-name cleanup used the two-step optimistic upload confirmation and created shared version 17.
- Final shared state is up to date at version 17 with guarded autosave off.
- Final trip invariants are `Columbus Day Week 2027`, October 9–16, 2027, two adults, two children, no park hopping and zero bookings.
- The decision engine still reports **Wait for official data / Keep the base plan provisional**, with the base plan active and the official 2027 MNSSHP calendar still the blocker.
- Railway health and the authoritative frontend Vercel deployment remained green after the run.

## Safety results

- Family devices performed no automatic polling and sent no SMS/text delivery.
- No family-key disablement, removal or retirement control was present.
- Invite credentials appeared only in immediate creation results.
- Device lists and persistent browser state exposed safe metadata only.
- No dependency/runtime, schema, itinerary order, reservation or automatic recommendation change was bundled into 5E.
- Raw family keys, device credentials, invite credentials, token hashes and peppers were not placed in source, logs, GitHub, screenshots or long-lived UI.

## Pass criteria

All Section 5E pass criteria are satisfied:

- a production Owner device exists and is manually verified;
- family-key recovery remains enabled and verified;
- Owner and Editor normal shared-plan flows pass;
- Viewer read-only boundaries pass;
- self-rename and Owner-managed revocation pass;
- a revoked-cookie-only device loses access without hidden fallback;
- shared-plan version/history and trip invariants remain intact;
- Railway and the authoritative frontend Vercel deployment are green;
- canonical closeout was explicitly authorized with **Finalize Section 5E**.

Section 5 may close with the family key still enabled. This result is not authorization to retire it.
