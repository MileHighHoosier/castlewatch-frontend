# CastleWatch Frontend Agent Instructions

Read these instructions before modifying this repository.

## Required context

CastleWatch spans two repositories:

- frontend: `MileHighHoosier/castlewatch-frontend`
- backend: `MileHighHoosier/castlewatch-2027`

Before cross-cutting or architectural changes, inspect both repositories. The backend repository holds the canonical rebaseline documents:

- `PROJECT_STATE.md`
- `ARCHITECTURE.md`
- `ROADMAP.md`

Do not use old chat history as the source of truth when current code/documentation disagrees.

## Change rules

1. Preserve user-visible behavior unless the task explicitly requires a change or a change is necessary for security/reliability.
2. Prefer small, reversible changes over broad rewrites.
3. Add or update automated tests for behavioral changes.
4. Keep itinerary/schedule changes user-approved; do not silently rearrange Trip Week.
5. Do not silently change the October 9-16, 2027 trip assumptions.
6. Do not present historical crowd signals as precise 2027 predictions.
7. Do not expose family keys, raw device tokens or invite tokens in logs, persistent UI or source control.
8. Be cautious with `localStorage` credentials and dynamic `innerHTML`; prefer declarative React rendering and safe text rendering.
9. Avoid adding more DOM polling/global patching when a React state/event approach is practical.
10. Update documentation when a change alters architecture, roadmap status or the current project state.

## Account/device migration safety gate

The account/device migration is incomplete.

- Do **not** remove or disable `CASTLEWATCH_FAMILY_KEY`.
- Do **not** assume a saved device token can replace the family key for all shared-plan actions.
- Normal shared-plan read/write/history/restore/operations behavior must remain backward compatible until dual authorization and production verification are complete.
- Do not add a family-key retirement UI without the documented owner-device/recovery gates and explicit user approval.

## Trip Week decision engine

`app/lib/tripDecisionEngine.ts` is an existing partial implementation of Trip Week Phase 2. Do not restart or replace it casually.

Current inputs include event risk, reservation conflicts, no-park-hopping, resort/transportation convenience and historical forecast signals. Weather and Lightning Lane are not yet fully integrated scenario-scoring inputs.

Any major change to this engine requires checking backend `trip_week.py`, calendar/event intelligence, reservation state and resort/transportation logic.

## Frontend architecture caution

Some existing features use imperative DOM augmentation, injected styles, global handlers and/or localStorage polling. These patterns are technical debt, but stabilization should migrate them incrementally with regression tests rather than rewriting the entire UI at once.

## Before finalizing a change

- run `npm test`,
- run the production Next.js build,
- verify relevant mobile flows,
- verify no credential/token was exposed,
- check whether the backend repository needs a coordinated change,
- update canonical backend project documentation when status or architecture changes.