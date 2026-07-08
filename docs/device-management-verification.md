# Device management manual verification

This checklist must be completed before considering any legacy family-key retirement option.

## Scope

Verify the production Family devices panel that was added under Shared Family Plan.

This checklist does not authorize or require any new code, backend schema changes, automatic polling, SMS/text delivery, or family-key removal.

## Prerequisites

- Production Vercel deployment is complete.
- Production Railway deployment is complete.
- Shared Family Plan still connects with the current family key.
- The user has at least two browsers or devices available for a realistic invite test.

## Test A: owner path with current family key

1. Open the production app on the primary browser.
2. Open Shared Family Plan.
3. Confirm the existing family key still connects.
4. Open Family devices.
5. Press Refresh device list.
6. Expected result: request succeeds or shows an empty list without breaking Shared Family Plan.
7. Confirm no key or raw token is displayed in the device list.

## Test B: create invite

1. In Family devices, enter a label such as `Katie iPhone`.
2. Choose role `Editor`.
3. Press Create invite.
4. Expected result: a one-time invite token is displayed.
5. Copy the invite token immediately.
6. Confirm the token is not placed in the device list.

## Test C: accept invite on second device/browser

1. Open the production app on a second browser or phone.
2. Open Shared Family Plan, then Family devices.
3. Enter a device name such as `Katie iPhone`.
4. Paste the invite token.
5. Press Accept invite.
6. Expected result: the browser reports that it is connected and saved.
7. Confirm the returned device token is not displayed after acceptance.
8. Refresh or reopen the app and confirm the local saved device status still appears.

## Test D: list and rename device from owner path

1. Return to the primary browser with the family key.
2. Open Family devices.
3. Press Refresh device list.
4. Expected result: the newly accepted device appears.
5. Rename the device to a clearly different name.
6. Press Rename.
7. Expected result: the new name appears after the action and remains after manual refresh.

## Test E: revoke device from owner path

1. On the primary browser, choose the secondary device.
2. Press Revoke.
3. Confirm the browser confirmation prompt.
4. Expected result: the device status changes to revoked.
5. On the secondary browser, try a manual device-list refresh.
6. Expected result: the revoked device can no longer use its saved token for device management.

## Test F: shared-plan regression

1. On the primary browser, use Shared Family Plan to check shared status.
2. Confirm the shared plan still loads.
3. Confirm guarded autosave remains off unless manually enabled.
4. Confirm manual upload/download behavior still works as before.
5. Confirm Operations still opens in a new tab.

## Safety checks

- No automatic polling should occur in Family devices.
- No SMS/text delivery should be triggered.
- No family-key removal or disablement should be visible.
- No raw device token should be displayed after invite acceptance.
- Invite tokens should appear only immediately after invite creation.
- Device list should show safe metadata only.

## Pass criteria

The phase can be considered verified when:

- current family-key access still works;
- an invite can be created;
- a second browser/device can accept the invite;
- the accepted device appears in the device list;
- renaming works;
- revoking works;
- the revoked device loses access;
- shared-plan sync still works as before.

## Do not proceed to family-key retirement until

- this checklist passes in production;
- at least one owner device exists and has been manually tested;
- a recovery path is documented;
- a rollback path is documented;
- the user explicitly authorizes adding an owner-controlled option to disable legacy family-key access.
