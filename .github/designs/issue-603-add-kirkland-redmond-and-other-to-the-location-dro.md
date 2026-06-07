_Design for feature request #603: [Feature Request] Add "Kirkland", "Redmond" and "Other" to the location dropdown_

# Design: Add "Kirkland", "Redmond" and "Other" to the location dropdown (#603)

## What the user wants

Add two new location options — "Kirkland WA" and "Other" — to the location dropdown that appears in the application create/edit modal and the filter bar chips. The user's request also listed "Redmond", but **"Redmond WA" is already present** in the dropdown; no change is needed for that value.

## Proposed implementation

Add `'Kirkland WA'` and `'Other'` to the `ApplicationLocation` union type and the `APPLICATION_LOCATIONS` array in `lib/types.ts`. Both consuming components (`ApplicationModal.tsx` and `FilterBar.tsx`) already iterate over `APPLICATION_LOCATIONS` dynamically, so they will automatically render the new options with no further changes.

### Files to modify or create

- **`lib/types.ts`** — add `'Kirkland WA'` and `'Other'` to the `ApplicationLocation` union type (line 27–31) and to the `APPLICATION_LOCATIONS` constant array (lines 184–189).
- **`__tests__/lib/types.test.ts`** — update the existing `APPLICATION_LOCATIONS` test to assert the new values are present.

### UI changes

- **ApplicationModal** (`components/modals/ApplicationModal.tsx`, line 365–374) — the Location `<select>` dropdown gains two new `<option>` elements: "Kirkland WA" and "Other". No code change required; the options are rendered from `APPLICATION_LOCATIONS`.
- **FilterBar** (`components/ui/FilterBar.tsx`, line 142–147) — the location multi-select chip row gains two new toggle chips: "Kirkland WA" and "Other". No code change required; chips are rendered from `APPLICATION_LOCATIONS`.

## Implementation plan

<!-- implementation-plan-json
[
  {"id":1,"title":"Add Kirkland WA and Other to ApplicationLocation","scope":"In lib/types.ts, add 'Kirkland WA' and 'Other' to the ApplicationLocation union type and the APPLICATION_LOCATIONS array. Update __tests__/lib/types.test.ts to assert both new values are present in APPLICATION_LOCATIONS.","files_to_create":[],"files_to_modify":["lib/types.ts","__tests__/lib/types.test.ts"],"test_file":"__tests__/lib/types.test.ts","estimated_turns":10}
]
-->

- [ ] **Step 1: Add Kirkland WA and Other to ApplicationLocation** (~10 turns) — Extend the `ApplicationLocation` union type and `APPLICATION_LOCATIONS` array in `lib/types.ts`, then update the unit test to assert both new values are present.

## Design decisions

**Naming convention for "Kirkland":** The existing WA-state locations all include the state abbreviation ("Bellevue WA", "Seattle WA", "Redmond WA"). Adding "Kirkland WA" keeps the format consistent. The alternative — plain "Kirkland" — would be inconsistent with the existing naming and could be ambiguous.

**"Other" without a state suffix:** "Other" is a catch-all that already appears in `ApplicationType` and `ApplicationSource` under the same name. Adding it bare (no state abbreviation) is consistent with its role as a freeform fallback, not a specific place.

**No database migration needed:** `location` is stored as a free-text `ApplicationLocation | null` column; the database has no check constraint on its values. New string values can be stored immediately without a schema change.

## Acceptance criteria

- [ ] The Location `<select>` in the ApplicationModal contains an option with text "Kirkland WA".
- [ ] The Location `<select>` in the ApplicationModal contains an option with text "Other".
- [ ] Selecting "Kirkland WA" in the modal, saving, and reopening the application shows "Kirkland WA" as the selected location.
- [ ] Selecting "Other" in the modal, saving, and reopening shows "Other" as the selected location.
- [ ] The FilterBar renders a chip labelled "Kirkland WA" that can be toggled to filter by that location.
- [ ] The FilterBar renders a chip labelled "Other" that can be toggled to filter applications with location "Other".
- [ ] "Redmond WA" continues to appear in both the modal dropdown and the filter bar (no regression).
- [ ] `APPLICATION_LOCATIONS` unit test passes and asserts presence of "Kirkland WA" and "Other".

## Human verification steps

None.

## Open questions

None.
