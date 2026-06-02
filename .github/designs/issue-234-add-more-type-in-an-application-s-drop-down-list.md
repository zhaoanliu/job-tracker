_Design for feature request #234: [Feature Request] add more "Type" in an application's drop down list_

# Design Proposal: Expand ApplicationType dropdown (Issue #234)

## What the user wants

The user wants two changes to the "Type" dropdown in the application form:

1. Rename the existing entry `Principal Engineer` → `Principal Software Engineer`.
2. Add seven new entries — Program Manager, Product Manager, Operation Manager, Business Manager, Chief of Staff, Staff Software Engineer, Senior Staff Software Engineer — inserted alphabetically before `Other`.

No external services are involved. The `type` column in the database is plain `text`, so no migration is required.

## Proposed implementation

Update the `ApplicationType` union type and the `APPLICATION_TYPES` constant array in `lib/types.ts` to reflect the renamed entry and the seven new entries. The modal and filter bar already iterate over `APPLICATION_TYPES` dynamically, so they pick up the changes without modification. Update the existing unit test in `__tests__/lib/types.test.ts` to cover the new members.

### Files to modify or create

- `lib/types.ts` — rename `'Principal Engineer'` → `'Principal Software Engineer'` in both the `ApplicationType` union and the `APPLICATION_TYPES` array; add the seven new entries before `'Other'`.
- `__tests__/lib/types.test.ts` — extend the `APPLICATION_TYPES` assertions to verify the renamed value, all seven new entries are present, and `'Other'` is still last.

### UI changes

The Type `<select>` in `ApplicationModal` (components/modals/ApplicationModal.tsx:317) renders each entry via `APPLICATION_TYPES.map(...)`. Once `APPLICATION_TYPES` is updated the dropdown will automatically show the new entries in the order they appear in the array. No direct change to the component is needed. The FilterBar type filter (components/ui/FilterBar.tsx) similarly iterates `APPLICATION_TYPES` and requires no changes.

## Implementation plan

<!-- implementation-plan-json
[
  {"id":1,"title":"Update ApplicationType union and APPLICATION_TYPES array","scope":"In lib/types.ts: rename 'Principal Engineer' to 'Principal Software Engineer' in the ApplicationType union and APPLICATION_TYPES array; insert Program Manager, Product Manager, Operation Manager, Business Manager, Chief of Staff, Staff Software Engineer, Senior Staff Software Engineer before 'Other'. Update __tests__/lib/types.test.ts to assert all new/renamed values are present and 'Other' remains last.","files_to_create":[],"files_to_modify":["lib/types.ts","__tests__/lib/types.test.ts"],"test_file":"__tests__/lib/types.test.ts","estimated_turns":10}
]
-->

- [ ] **Step 1: Update ApplicationType union and APPLICATION_TYPES array** (~10 turns) — Rename `Principal Engineer` and add seven new type entries in `lib/types.ts`, then update `__tests__/lib/types.test.ts` to assert all new and renamed values.

## Design decisions

**Order of new entries.** The user listed the new entries in a specific order (Program Manager, Product Manager, Operation Manager, Business Manager, Chief of Staff, Staff Software Engineer, Senior Staff Software Engineer). The existing list is not alphabetically sorted (Security Engineer, Security Architect appear before Other), so this proposal preserves the user's stated order rather than re-sorting the whole list, keeping the change minimal and predictable.

**No database migration.** The `type` column is `text`, not an enum. Existing rows with `'Principal Engineer'` will no longer match the TypeScript union after the rename — they will be treated as unknown values at the application layer. This is acceptable: the field is nullable and display-only; no query logic filters on specific type values. A data migration script to back-fill existing rows is out of scope per the user's request.

## Acceptance criteria

- [ ] Opening the "Add Application" modal shows a Type dropdown containing `Principal Software Engineer` (not `Principal Engineer`).
- [ ] The Type dropdown contains all seven new entries: `Program Manager`, `Product Manager`, `Operation Manager`, `Business Manager`, `Chief of Staff`, `Staff Software Engineer`, `Senior Staff Software Engineer`.
- [ ] `Other` remains the last option in the Type dropdown.
- [ ] `Principal Engineer` does not appear anywhere in the Type dropdown.
- [ ] The FilterBar type filter chip list includes the new entries (visible when a filter is applied).
- [ ] Unit tests in `__tests__/lib/types.test.ts` pass, including assertions on the renamed and new values.

## Human verification steps

None.

## Open questions

None.
