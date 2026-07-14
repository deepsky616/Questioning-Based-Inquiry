# Student Management Clarity and Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make teacher student-management totals match the visible scope, expose failures with retry actions, and make student search and filter clearing efficient.

**Architecture:** Keep all database and API contracts unchanged. Move display-only summary and search rules into a small pure helper module, keep React Query as the source of remote status, and render explicit loading, error, retry, and success feedback in the existing components.

**Tech Stack:** Next.js, React, TypeScript, TanStack Query, next-intl, Vitest, Testing Library

## Global Constraints

- Do not change database schemas, stored data, API payloads, or authorization boundaries.
- Keep Korean and English translation keys aligned.
- Implement tasks in the order shown and verify each task before starting the next.
- Preserve existing dashboard links and student-management query parameters.

---

### Task 1: Visible-scope totals and cumulative labels

**Files:**
- Create: `src/lib/teacher-student-management.ts`
- Create: `src/__tests__/teacher-student-management.test.ts`
- Modify: `src/app/(teacher)/teacher-students/page.tsx`
- Modify: `messages/ko.json`
- Modify: `messages/en.json`

**Interfaces:**
- Produces: `summarizeStudentActivity(students)` returning count, question, answer, point, and average-point totals.
- Consumes: The page's already-filtered student array; no server change.

- [x] **Step 1: Write failing summary tests**

Cover a filtered two-student input and assert that excluded students do not affect count, questions, answers, points, or average points.

- [x] **Step 2: Verify the tests fail**

Run: `npm test -- src/__tests__/teacher-student-management.test.ts`

Expected: failure because `teacher-student-management.ts` does not exist.

- [x] **Step 3: Implement the pure summary helper and use it in the page**

Calculate the four summary cards from `filtered`, show the visible count against the full count, and avoid rendering scope totals while the filtered activity request is pending or failed.

- [x] **Step 4: Clarify cumulative values in both locales**

Use labels equivalent to cumulative questions, cumulative answers, and current points. State that period filters select students by period while displayed activity values remain cumulative.

- [x] **Step 5: Verify task 1**

Run: `npm test -- src/__tests__/teacher-student-management.test.ts src/__tests__/teacher-student-question-activity-scope.test.ts src/__tests__/i18n-parity.test.ts`

Expected: all tests pass.

---

### Task 2: Loading, failure, retry, and point feedback

**Files:**
- Modify: `src/app/(teacher)/teacher-students/StudentDetailDialog.tsx`
- Modify: `src/components/teacher/StudentBulkRegisterCard.tsx`
- Modify: `src/components/teacher/StudentPasswordResetCard.tsx`
- Create: `src/__tests__/teacher-student-admin-errors.render.test.tsx`
- Create: `src/__tests__/teacher-student-detail-errors.render.test.tsx`
- Modify: `messages/ko.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: Existing React Query `isLoading`, `isError`, and `refetch` results.
- Produces: Visible alerts with retry actions and toast feedback for point changes.

- [x] **Step 1: Write failing render tests**

Verify that profile loading failure, student-list loading failure, detailed-stat failure, and pending-point failure are not shown as empty or indefinitely loading states and that retry invokes the correct request.

- [x] **Step 2: Verify the tests fail**

Run: `npm test -- src/__tests__/teacher-student-admin-errors.render.test.tsx src/__tests__/teacher-student-detail-errors.render.test.tsx`

Expected: failures because the explicit alerts and retry actions are absent.

- [x] **Step 3: Implement loading and retry states**

Do not render the bulk registration form until the teacher profile is loaded. Distinguish student-list loading, empty, and error states. Throw on failed pending-point requests and expose both detailed-stat and pending-point retries.

- [x] **Step 4: Implement point-change success and failure feedback**

Throw on non-success responses, preserve the entered change on failure, clear it only after success, and show localized success or failure toasts.

- [x] **Step 5: Verify task 2**

Run: `npm test -- src/__tests__/teacher-student-admin-errors.render.test.tsx src/__tests__/teacher-student-detail-errors.render.test.tsx src/__tests__/teacher-students-error.render.test.tsx src/__tests__/i18n-parity.test.ts`

Expected: all tests pass.

---

### Task 3: Student-number and class-combination search with filter reset

**Files:**
- Modify: `src/lib/teacher-student-management.ts`
- Modify: `src/__tests__/teacher-student-management.test.ts`
- Modify: `src/app/(teacher)/teacher-students/page.tsx`
- Modify: `messages/ko.json`
- Modify: `messages/en.json`

**Interfaces:**
- Produces: `matchesStudentManagementSearch(student, query)` supporting name, number, grade, class, `5-2`, and `5학년 2반` forms.
- Produces: A page reset action that clears search, class, progress, and dashboard-supplied filters while preserving all data.

- [x] **Step 1: Write failing search tests**

Cover student number, spaced grade-class text, hyphenated grade-class text, name, and a non-match.

- [x] **Step 2: Verify the tests fail**

Run: `npm test -- src/__tests__/teacher-student-management.test.ts`

Expected: failures because the search helper is absent.

- [x] **Step 3: Implement search, result count, and reset**

Replace the inline search comparison with the pure helper. Show visible versus total student counts and provide one localized action that clears all active search and filter state.

- [x] **Step 4: Verify task 3 and the complete change**

Run: `npm test -- src/__tests__/teacher-student-management.test.ts src/__tests__/teacher-student-admin-errors.render.test.tsx src/__tests__/teacher-student-detail-errors.render.test.tsx src/__tests__/teacher-students-error.render.test.tsx src/__tests__/teacher-student-question-activity-scope.test.ts src/__tests__/i18n-parity.test.ts`

Expected: all tests pass.

- [x] **Step 5: Run repository verification**

Run: `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.

Expected: all commands exit successfully.

- [x] **Step 6: Commit and push**

Commit only the files in this plan and push the verified commit to `origin/main`.
