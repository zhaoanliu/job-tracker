_Design for feature request #410: [Feature Request] can duplicate an application_

# Design Proposal: Duplicate Application (Issue #410)

## What the user wants

When viewing an existing application in the edit modal, the user wants a one-click "Duplicate" action that creates a copy of that application on the board — similar to how Google Calendar lets you duplicate a calendar event. The copy should pre-fill all the job-posting details (company, role, location, JD, etc.) so the user can start tracking a related application without re-entering everything from scratch.

No ambiguity: the user wants duplication from an existing card, not bulk duplication. The only open decision is which fields to carry over (see Design Decisions).

---

## Proposed implementation

Add an `onDuplicate` prop to `ApplicationModal` that renders a "Duplicate" button in the modal footer when editing. In `KanbanBoard`, `handleDuplicate` inserts a new row copying all job-posting fields from the source application (company, role, team, type, priority, location, workmode, date, link, source, referrer, jd, status) while clearing progress-specific fields (notes, next_step). The new card is inserted at the end of the same column, state is updated optimistically, and the modal closes — no second confirmation step needed.

### Files to modify or create

- `components/modals/ApplicationModal.tsx` — add `onDuplicate?: () => Promise<void>` prop; add "Duplicate" button in footer with `duplicating` loading state; only renders when prop is provided (edit mode only)
- `components/board/KanbanBoard.tsx` — add `handleDuplicate` function that builds the copy payload from `editingApp`, inserts via Supabase, updates local state and `persistedStatus`, records status history, then closes the modal; pass `onDuplicate` to `ApplicationModal`
- `__tests__/components/modals/ApplicationModal.test.tsx` — add tests: renders Duplicate button only in edit mode, button calls `onDuplicate`, shows loading state while duplicating
- `e2e/local/board.spec.ts` — add E2E test: add application → click card → click Duplicate → verify two cards with same company appear on the board

### UI changes

**Component:** `ApplicationModal` — the modal footer  
**Location:** Footer left side, to the right of the existing "Delete application" button area (or occupying the left footer slot when in edit mode that already shows Delete)  
**Interaction:** A "Duplicate" text button appears in the bottom-left footer only when editing an existing application. Clicking it fires the duplicate action, shows "Duplicating…" while in-flight, then closes the modal. The duplicated card appears on the board in the same column. No extra confirmation dialog — duplication is non-destructive.

Exact footer layout in edit mode:
```
[ Delete application ]  ← existing left slot (confirm flow unchanged)
                         [ Cancel ] [ Save Changes ] [ Duplicate ]
```

Wait — to keep the layout clean and avoid crowding the right side, Duplicate sits in the **left** footer area alongside Delete (separate from save/cancel):

```
[ Delete application ]  [ Duplicate ]   |   [ Cancel ] [ Save Changes ]
```

This separates destructive/copy actions (left) from save/cancel (right) and keeps the right side at exactly 2 buttons.

---

## Implementation plan

<!-- implementation-plan-json
[
  {"id":1,"title":"Add duplicate button to ApplicationModal and handleDuplicate to KanbanBoard","scope":"In ApplicationModal.tsx: add onDuplicate?: () => Promise<void> prop, add 'Duplicate' button in footer left area next to delete (visible only in edit mode, with duplicating/loading state). In KanbanBoard.tsx: add handleDuplicate() that builds a copy of editingApp omitting notes/next_step, inserts via supabase, updates applications state and persistedStatus, calls recordStatusHistory, then calls setModalOpen(false). Pass onDuplicate={editingApp ? () => handleDuplicate() : undefined} to ApplicationModal.","files_to_create":[],"files_to_modify":["components/modals/ApplicationModal.tsx","components/board/KanbanBoard.tsx"],"test_file":"__tests__/components/modals/ApplicationModal.test.tsx","estimated_turns":15},
  {"id":2,"title":"Add E2E test for duplicate workflow","scope":"In e2e/local/board.spec.ts: add a test that logs in, creates an application (e.g. 'Dup Me Corp'), clicks the card to open the edit modal, clicks the Duplicate button, waits for the modal to close, then asserts two cards with text 'Dup Me Corp' are visible on the board.","files_to_create":[],"files_to_modify":["e2e/local/board.spec.ts"],"test_file":"e2e/local/board.spec.ts","estimated_turns":10}
]
-->

- [ ] **Step 1: Add duplicate button to ApplicationModal and handleDuplicate to KanbanBoard** (~15 turns) — Wire up the duplicate action end-to-end: new `onDuplicate` prop on the modal, Duplicate button in the footer, and `handleDuplicate` in KanbanBoard that inserts the copied row; update `ApplicationModal.test.tsx` with new button/behavior tests.
- [ ] **Step 2: Add E2E test for duplicate workflow** (~10 turns) — Add a Playwright test in `e2e/local/board.spec.ts` that creates an application, clicks Duplicate in the edit modal, and asserts two cards with the same company name appear on the board.

---

## Design decisions

**1. Which fields to copy vs. clear**  
Chosen: copy all job-posting fields (company, role, team, type, priority, location, workmode, date, link, source, referrer, jd, status); clear progress-specific fields (notes, next_step).  
Alternative: copy everything including notes/next_step.  
Why chosen: notes and next_step are specific to the user's interactions with a particular application process (recruiter names, follow-up reminders). They're not part of the job posting description and would create confusion if carried to a new application tracking entry. Job-posting content (JD, link, company) is the part worth duplicating. This matches what "duplicate" means in practice: same role, fresh start on progress.

**2. No second modal / edit-before-save flow**  
Chosen: duplicate fires immediately, closes the modal, card appears on board.  
Alternative: open the duplicated application in the modal for review before saving.  
Why chosen: the existing board patterns (drag-and-drop, delete) are all immediate + optimistic — no confirmation dialogs except for destructive delete. Duplicate is non-destructive, so requiring a second save step would be inconsistent with the board's interaction model. The user can click the new card to edit it immediately if needed.

**3. Duplicate button placement in the modal footer**  
Chosen: bottom-left footer, next to Delete.  
Alternative: right side alongside Save/Cancel.  
Why chosen: the footer's right side already has Cancel + Save Changes — a well-established affordance for "form submission" actions. Duplicate is not a form save — it's a secondary action closer in spirit to Delete (operates on the application entity, not the form being edited). Grouping it left keeps the right-side save area clean and avoids 3-button crowding.

**4. No new API route**  
Chosen: duplicate via direct Supabase client insert (same as all other CRUD operations in KanbanBoard).  
Alternative: introduce a `/api/applications/duplicate` route.  
Why chosen: every create/update/delete in this codebase goes through the Supabase client directly in KanbanBoard — there are no application-entity API routes at all. Adding one for duplicate would be an inconsistent pattern and unnecessary indirection.

---

## Acceptance criteria

- [ ] When the edit modal is open, a "Duplicate" button is visible in the footer left area
- [ ] The "Duplicate" button is NOT present when the new-application modal is open (create mode)
- [ ] Clicking "Duplicate" closes the modal
- [ ] After clicking "Duplicate", the board shows two cards with the same company name as the original in the same column
- [ ] The duplicated card preserves: company, role, team, type, priority, location, workmode, date, link, source, jd, status
- [ ] The duplicated card has empty notes and next_step (not carried over)
- [ ] While the duplicate request is in-flight, the button shows "Duplicating…" and is disabled
- [ ] If the duplicate Supabase insert fails, `console.error` is called and the modal stays open (no silent failure)
- [ ] After duplicating, the stats bar "Total Applications" count increments by 1

## Human verification steps

None.

---

## Open questions

None. All decisions were resolved through codebase investigation.
