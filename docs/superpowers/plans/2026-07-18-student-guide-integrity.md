# Student Guide Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Prevent student guides from becoming mismatched, silently omitted, or overwritten while teachers create and edit inquiry lesson designs.

**Architecture:** Extend the existing source signature to cover selected key words, keep one restorable guide snapshot around regeneration, and require an explicit choice before saving without stale or incomplete guides. Apply the same source tracking and bundle validation to the saved-design editor so both entry points enforce the same integrity rules.

**Tech Stack:** Next.js, React, TypeScript, next-intl, Vitest, Testing Library

## Global Constraints

- Preserve the existing optional nature of student guides.
- Never save stale or incomplete student guides into a lesson design.
- Ask before discarding current teacher-edited guides or saving without invalid guides.
- Keep Korean and English translation keys in sync.
- Follow red-green-refactor for every behavior change.

---

### Task 1: Key word source tracking

**Files:**
- Modify: `src/lib/student-guide-source.ts`
- Modify: `src/app/(teacher)/teacher-curriculum/useStudentInquiryGuides.ts`
- Modify: `src/app/(teacher)/teacher-curriculum/page.tsx`
- Test: `src/__tests__/student-guide-source.test.ts`
- Test: `src/__tests__/student-inquiry-guides-hook.test.tsx`

**Interfaces:**
- Consumes: `selectedKeywords: string[]` from the curriculum page.
- Produces: `buildStudentGuideSourceSignature()` that changes when normalized selected key words change.

- [x] **Step 1: Write failing signature and hook tests**

Add assertions that changing `selectedKeywords` changes the signature, makes generated guides stale, and rejects a delayed response created for older key words.

- [x] **Step 2: Run the focused tests and verify the new assertions fail**

Run: `npx vitest run src/__tests__/student-guide-source.test.ts src/__tests__/student-inquiry-guides-hook.test.tsx`

Expected: failures showing that `selectedKeywords` is not accepted or does not affect freshness.

- [x] **Step 3: Add selected key words to the source contract**

Extend `StudentGuideSourceInput` and `UseStudentInquiryGuidesOptions` with `selectedKeywords: string[]`, normalize the values in the signature, and pass the page state into the hook.

- [x] **Step 4: Run the focused tests and verify they pass**

Run: `npx vitest run src/__tests__/student-guide-source.test.ts src/__tests__/student-inquiry-guides-hook.test.tsx`

Expected: all focused tests pass.

### Task 2: Safe regeneration with one-step restore

**Files:**
- Modify: `src/app/(teacher)/teacher-curriculum/useStudentInquiryGuides.ts`
- Modify: `src/app/(teacher)/teacher-curriculum/InquiryDistributionReview.tsx`
- Modify: `messages/ko.json`
- Modify: `messages/en.json`
- Test: `src/__tests__/student-inquiry-guides-hook.test.tsx`
- Test: `src/__tests__/inquiry-distribution-review.render.test.tsx`

**Interfaces:**
- Produces: `canRestoreStudentGuides: boolean` and `restorePreviousStudentGuides(): void` from the hook.
- Consumes: confirmation result before `onGenerateGuides()` is called when current guides exist.

- [x] **Step 1: Write failing restore and confirmation tests**

Cover preserving the current guide bundle before regeneration, restoring it once, clearing restore state after source changes, and requiring confirmation before regeneration.

- [x] **Step 2: Run the focused tests and verify the new assertions fail**

Run: `npx vitest run src/__tests__/student-inquiry-guides-hook.test.tsx src/__tests__/inquiry-distribution-review.render.test.tsx`

- [x] **Step 3: Implement snapshot, confirmation, and restore controls**

Capture only guides that match the current source, replace them after a confirmed regeneration, and expose a one-step restore button. Do not restore a snapshot after its source signature changes.

- [x] **Step 4: Run the focused tests and verify they pass**

Run: `npx vitest run src/__tests__/student-inquiry-guides-hook.test.tsx src/__tests__/inquiry-distribution-review.render.test.tsx`

### Task 3: Explicit save without invalid guides

**Files:**
- Modify: `src/app/(teacher)/teacher-curriculum/page.tsx`
- Modify: `messages/ko.json`
- Modify: `messages/en.json`
- Test: `src/__tests__/question-class-create-flow.test.ts`

**Interfaces:**
- Produces: a shared page-level confirmation gate used by save-only and save-and-create actions.
- Guarantees: the payload contains guides only when `hasFreshStudentGuides` is true.

- [x] **Step 1: Write a failing source-level flow test**

Assert that both save actions call the same invalid-guide confirmation gate before saving and that the payload still excludes invalid guides.

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/__tests__/question-class-create-flow.test.ts`

- [x] **Step 3: Implement the confirmation gate**

When guides are stale or incomplete, offer to return to editing or continue without guides. Do not prompt when no guides were created or when the bundle is fresh.

- [x] **Step 4: Run the focused test and verify it passes**

Run: `npx vitest run src/__tests__/question-class-create-flow.test.ts`

### Task 4: Saved-design integrity parity

**Files:**
- Modify: `src/app/(teacher)/teacher-curriculum/SavedDesignsTab.tsx`
- Modify: `messages/ko.json`
- Modify: `messages/en.json`
- Test: `src/__tests__/saved-designs-tab.render.test.tsx`
- Test: `src/__tests__/saved-design-edit-source.test.ts`

**Interfaces:**
- Consumes: `buildStudentGuideSourceSignature()` and `validateStudentGuideBundle()`.
- Guarantees: saved-design generation includes selected key words, delayed results are discarded after source edits, and only fresh complete guides are patched.

- [x] **Step 1: Write failing saved-design regression tests**

Cover selected key words in generation, stale-state display after source editing, confirmation before replacement or omission, and omission of invalid guides from the patch payload.

- [x] **Step 2: Run the focused tests and verify the new assertions fail**

Run: `npx vitest run src/__tests__/saved-designs-tab.render.test.tsx src/__tests__/saved-design-edit-source.test.ts`

- [x] **Step 3: Apply source tracking and validation to saved designs**

Record the source signature when edit mode opens, update it after successful generation, validate the complete bundle before applying it, hide stale guides, and use the same confirmation copy before replacing or omitting guides.

- [x] **Step 4: Run the focused tests and verify they pass**

Run: `npx vitest run src/__tests__/saved-designs-tab.render.test.tsx src/__tests__/saved-design-edit-source.test.ts`

### Task 5: Full verification and delivery

**Files:**
- Review: all modified files

**Interfaces:**
- Produces: a verified commit on the feature branch and a fast-forwarded `origin/main`.

- [x] **Step 1: Run lint**

Run: `npm run lint`

- [x] **Step 2: Run the full test suite**

Run: `npm test`

- [x] **Step 3: Run the production build**

Run: `npm run build`

- [x] **Step 4: Review the final diff and repository status**

Run: `git diff --check` and inspect `git diff --stat` plus the complete diff.

- [x] **Step 5: Commit and push**

Create a conventional commit describing student-guide integrity, push the feature branch, then fast-forward the verified commit to `origin/main`.
