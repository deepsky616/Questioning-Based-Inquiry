# 질문연습 학습지 두 쪽 출력 구현 계획

> **작업 에이전트 필수 기술:** 이 계획은 `superpowers:subagent-driven-development` 또는 `superpowers:executing-plans`로 작업별 실행한다. 모든 단계는 확인 상자로 추적한다.

**목표:** 교사 질문연습 학습지를 제목과 학생 작성란 순서가 정확하고 두 쪽 모두 인쇄 가능 높이를 고르게 사용하는 에이포 문서로 만든다.

**구조:** 출력 문서를 첫째 쪽 안내 면과 둘째 쪽 활동 면으로 나누고, 각 면의 높이를 284밀리미터로 고정한다. 남은 높이는 세 행 격자로 질문 유형 카드와 활동 카드에 배분하며, 기존 학습 내용과 다른 인쇄 화면은 바꾸지 않는다.

**기술 구성:** 넥스트 16, 리액트, 타입스크립트, 테일윈드 클래스, 인쇄 전용 CSS, 비테스트, 플레이wright

## 전체 제약

- 인쇄 용지는 에이포이고 바깥 여백은 각 6밀리미터다.
- 각 인쇄 면의 높이는 `284mm`, 높이 계산은 `border-box`다.
- 인쇄 순서는 제목, 안내, 학년·반·번호, 이름이다.
- 질문 유형 이해하기와 질문연습 활동은 서로 다른 쪽에 있어야 한다.
- 본문은 11픽셀 기준이고 세부 설명도 10픽셀 아래로 낮추지 않는다.
- 한국어와 영어 PDF가 각각 정확히 두 쪽이어야 한다.
- 기존 학습 내용, 문항 수, 다른 보고서 인쇄 스타일은 바꾸지 않는다.

## 파일 구성

- `src/app/(teacher)/teacher-practice/print-guide/page.tsx`: 머리말 순서, 두 인쇄 면, 높이를 받을 내부 격자 이름을 제공한다.
- `src/app/globals.css`: 에이포 면 높이, 쪽 나눔, 세 행 높이 분배, 답안 영역 확장을 담당한다.
- `src/__tests__/question-practice-print-guide.test.ts`: 문서 순서와 인쇄 스타일 계약을 고정한다.
- `e2e/question-practice-print.spec.ts`: 실제 한국어와 영어 PDF의 쪽 수, 넘침, 하단 채움과 그림을 검증한다.

---

### Task 1: 머리말 순서와 두 인쇄 면 구조

**파일:**
- 수정: `src/__tests__/question-practice-print-guide.test.ts`
- 수정: `src/app/(teacher)/teacher-practice/print-guide/page.tsx`

**제공 결과:**
- `qp-sheet-guide`: 제목, 안내, 학생 정보, 질문 유형 영역을 담는 첫째 쪽
- `qp-sheet-activity`: 질문연습 활동을 담는 둘째 쪽
- `qp-card-grid`, `qp-pattern-grid`, `qp-prompt-list`, `qp-writing-lines`: 인쇄 높이를 분배할 내부 경계

- [ ] **1단계: 실패하는 구조 시험 작성**

`src/__tests__/question-practice-print-guide.test.ts`의 화면 구조 시험에 다음 검증을 추가한다.

```ts
const titleIndex = pageSource.indexOf("{guide.title}");
const subtitleIndex = pageSource.indexOf("{guide.subtitle}");
const studentFieldsIndex = pageSource.indexOf("qp-student-fields");
const metaRowIndex = pageSource.indexOf("qp-student-row-meta");
const nameRowIndex = pageSource.indexOf("qp-student-row-name");

expect(pageSource).toContain("qp-sheet qp-sheet-guide");
expect(pageSource).toContain("qp-sheet qp-sheet-activity qp-activity");
expect(pageSource).toContain("qp-card-grid");
expect(pageSource).toContain("qp-pattern-grid");
expect(pageSource).toContain("qp-prompt-list");
expect(pageSource).toContain("qp-writing-lines");
expect(titleIndex).toBeGreaterThan(-1);
expect(titleIndex).toBeLessThan(subtitleIndex);
expect(subtitleIndex).toBeLessThan(studentFieldsIndex);
expect(metaRowIndex).toBeLessThan(nameRowIndex);
expect(pageSource).not.toContain("qp-student-fields ml-auto");
```

- [ ] **2단계: 구조 시험이 실패하는지 확인**

실행: `npm test -- src/__tests__/question-practice-print-guide.test.ts`

예상: `qp-sheet qp-sheet-guide`를 찾지 못해 실패한다.

- [ ] **3단계: 머리말과 두 면 구조 구현**

`page.tsx`에서 제목과 안내를 독립 `qp-heading`으로 두고 작성란을 그 아래로 옮긴다.

```tsx
<div className="qp-header border-b border-slate-300 pb-5">
  <p className="qp-eyebrow text-xs font-bold uppercase tracking-[0.12em] text-indigo-700">
    {guide.eyebrow}
  </p>
  <div className="qp-heading mt-2">
    <h1 className="qp-title text-3xl font-extrabold leading-tight text-slate-950">{guide.title}</h1>
    <p className="qp-subtitle mt-2 text-sm leading-6 text-slate-700">{guide.subtitle}</p>
  </div>
  <div className="qp-student-fields mt-4 flex w-full flex-col gap-3 text-left text-sm text-slate-700">
    <div className="qp-student-row qp-student-row-meta grid grid-cols-3 gap-x-4 gap-y-2">
      {[guide.gradeLabel, guide.classNameLabel, guide.numberLabel].map((label) => (
        <div key={label} className="qp-field flex items-center gap-2">
          <span className="w-10 shrink-0 font-semibold">{label}</span>
          <span className="qp-write-line h-7 min-w-12 flex-1 border-b border-slate-500" />
        </div>
      ))}
    </div>
    <div className="qp-student-row qp-student-row-name flex">
      <div className="qp-field flex w-full items-center gap-2">
        <span className="w-10 shrink-0 font-semibold">{guide.nameLabel}</span>
        <span className="qp-write-line h-7 min-w-24 flex-1 border-b border-slate-500" />
      </div>
    </div>
  </div>
</div>
```

현재 `qp-header` 바로 앞에 `<div className="qp-sheet qp-sheet-guide">`를 추가하고 기존 `qp-guide` 절 뒤에서 닫는다. `qp-guide` 내부 목록 클래스는 `qp-card-grid grid gap-4 print:gap-3`, 유형별 방법 목록은 `qp-pattern-grid mt-4 grid gap-3 md:grid-cols-3 print:grid-cols-3`으로 바꾼다.

기존 `qp-activity` 절은 `qp-sheet-guide`를 닫은 뒤에 두고 클래스는 `qp-sheet qp-sheet-activity qp-activity mt-7 space-y-4`로 바꾼다. 활동 목록은 `qp-card-grid qp-worksheet-grid grid gap-4 print:gap-3`, 각 활동 카드는 `qp-card qp-worksheet break-inside-avoid rounded-lg border border-slate-300 p-4 print:rounded-none`, 문항 목록은 `qp-prompt-list mt-4 space-y-4`로 바꾼다. 분류 답안 묶음에는 `qp-answer-grid`, 두 작성선 묶음에는 `qp-writing-lines`를 추가한다. 반복 자료와 표시 문구는 그대로 둔다.

- [ ] **4단계: 구조 시험 통과 확인**

실행: `npm test -- src/__tests__/question-practice-print-guide.test.ts`

예상: 해당 시험 파일 전체 통과.

- [ ] **5단계: 구조 변경 커밋**

```bash
git add src/__tests__/question-practice-print-guide.test.ts 'src/app/(teacher)/teacher-practice/print-guide/page.tsx'
git commit -m "fix(practice): 학습지 머리말과 두 쪽 구조 정리"
```

### Task 2: 두 쪽 높이 채움 인쇄 스타일

**파일:**
- 수정: `src/__tests__/question-practice-print-guide.test.ts`
- 수정: `src/app/globals.css`

**사용 입력:** 작업 1의 `qp-sheet`, `qp-card-grid`, `qp-pattern-grid`, `qp-prompt-list`, `qp-writing-lines`

**제공 결과:** 각 면 284밀리미터, 첫째 쪽 뒤 쪽 나눔, 세 카드 균등 높이, 답안 작성 영역 확장

- [ ] **1단계: 실패하는 인쇄 높이 시험 작성**

```ts
expect(cssSource).toContain(".question-practice-print .qp-sheet {");
expect(cssSource).toContain("height: 284mm !important");
expect(cssSource).toContain("box-sizing: border-box !important");
expect(cssSource).toContain(".question-practice-print .qp-sheet-guide {");
expect(cssSource).toContain("break-after: page");
expect(cssSource).toContain(".question-practice-print .qp-card-grid {");
expect(cssSource).toContain("grid-template-rows: repeat(3, minmax(0, 1fr)) !important");
expect(cssSource).toContain(".question-practice-print .qp-prompt-list {");
expect(cssSource).toContain(".question-practice-print .qp-writing-lines {");
expect(cssSource).toContain(".question-practice-print .qp-eyebrow {");
expect(cssSource).toContain("display: none !important");
expect(cssSource).toContain(".question-practice-print-page .qp-sheet + .qp-sheet {");
expect(cssSource).toContain("margin-top: 24px");
expect(cssSource).not.toContain("max-width: 275px !important");
```

- [ ] **2단계: 인쇄 스타일 시험이 실패하는지 확인**

실행: `npm test -- src/__tests__/question-practice-print-guide.test.ts`

예상: `height: 284mm !important`를 찾지 못해 실패한다.

- [ ] **3단계: 높이 배분 스타일 구현**

`src/app/globals.css`에서 첫 규칙은 `@media print` 앞의 질문연습 화면 묶음에 추가한다. 나머지 규칙은 질문연습 인쇄 묶음에 추가하고 기존 `qp-activity` 강제 앞쪽 나눔과 275픽셀 작성란 제한을 제거한다.

```css
.question-practice-print-page .qp-sheet + .qp-sheet {
  margin-top: 24px;
  border-top: 1px solid #cbd5e1;
  padding-top: 24px;
}

.question-practice-print .qp-sheet {
  box-sizing: border-box !important;
  display: flex !important;
  flex-direction: column !important;
  height: 284mm !important;
  min-height: 284mm !important;
}
.question-practice-print .qp-sheet-guide {
  break-after: page;
  page-break-after: always;
}
.question-practice-print .qp-eyebrow {
  display: none !important;
}
.question-practice-print .qp-student-fields {
  width: 100% !important;
  max-width: none !important;
  text-align: left !important;
}
.question-practice-print .qp-guide,
.question-practice-print .qp-activity {
  display: flex !important;
  flex: 1 1 auto !important;
  flex-direction: column !important;
  min-height: 0 !important;
}
.question-practice-print .qp-activity {
  break-before: auto;
  page-break-before: auto;
  margin-top: 0 !important;
  border-top: 0 !important;
  padding-top: 0 !important;
}
.question-practice-print .qp-card-grid {
  display: grid !important;
  flex: 1 1 auto !important;
  grid-template-rows: repeat(3, minmax(0, 1fr)) !important;
  min-height: 0 !important;
}
.question-practice-print .qp-card,
.question-practice-print .qp-pattern {
  display: flex !important;
  flex-direction: column !important;
  min-height: 0 !important;
}
.question-practice-print .qp-pattern-grid,
.question-practice-print .qp-prompt-list {
  flex: 1 1 auto !important;
  min-height: 0 !important;
}
.question-practice-print .qp-prompt-list {
  display: grid !important;
  grid-template-rows: repeat(3, minmax(0, 1fr)) !important;
}
.question-practice-print .qp-question-block {
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0 !important;
}
.question-practice-print .qp-answer-grid,
.question-practice-print .qp-writing-lines {
  height: 100% !important;
  min-height: 0 !important;
}
.question-practice-print .qp-writing-lines {
  display: grid !important;
  grid-template-rows: repeat(2, minmax(0, 1fr)) !important;
}
```

기본 인쇄 본문은 11픽셀, 세부 설명은 10픽셀 이상으로 두고 머리말, 카드, 답안 영역의 간격은 높이 격자 안에서 조정한다. 일반 화면의 두 면 사이는 24픽셀로 구분하고 인쇄 때 그 간격을 제거한다.

- [ ] **4단계: 인쇄 스타일 시험 통과 확인**

실행: `npm test -- src/__tests__/question-practice-print-guide.test.ts`

예상: 해당 시험 파일 전체 통과.

- [ ] **5단계: 인쇄 스타일 커밋**

```bash
git add src/__tests__/question-practice-print-guide.test.ts src/app/globals.css
git commit -m "fix(practice): 학습지 두 쪽 높이 균등 배치"
```

### Task 3: 실제 인쇄와 전체 회귀 확인

**파일:**
- 검증에서 넘침이 확인되면 수정: `src/app/(teacher)/teacher-practice/print-guide/page.tsx`
- 검증에서 넘침이 확인되면 수정: `src/app/globals.css`
- 확인: `src/__tests__/question-practice-print-guide.test.ts`
- 생성: `e2e/question-practice-print.spec.ts`

**사용 입력:** 작업 1과 2에서 완성한 두 면 문서

**제공 결과:** 한국어와 영어 각각 두 쪽이고 잘림과 큰 하단 빈 공간이 없는 자동 화면 시험과 검증 결과

- [ ] **1단계: 실제 출력 화면 시험 작성**

`e2e/question-practice-print.spec.ts`를 다음 내용으로 만든다.

```ts
import { expect, test, type Page } from "@playwright/test";
import {
  cleanupQuestionLearningTeacher,
  prepareQuestionLearningTeacher,
  type QuestionLearningTeacherFixture,
} from "./helpers/test-db";

const FIXTURE_KEY = "practice-print";

async function loginAsTeacher(page: Page, teacher: QuestionLearningTeacherFixture) {
  await page.goto("/login");
  await page.getByRole("tab", { name: /교사/ }).click();
  await page.locator("#t-email").fill(teacher.email);
  await page.locator("#t-password").fill(teacher.password);
  await page.getByRole("button", { name: "교사 로그인" }).click();
  await page.waitForURL("**/teacher-dashboard", { timeout: 20_000 });
}

function countPdfPages(pdf: Buffer): number {
  return Array.from(pdf.toString("latin1").matchAll(/\/Type\s*\/Page\b/g)).length;
}

test.describe("질문연습 학습지 출력", () => {
  let teacher: QuestionLearningTeacherFixture | undefined;

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "chromium") return;
    teacher = await prepareQuestionLearningTeacher(FIXTURE_KEY);
  });

  test.afterAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "chromium") return;
    await cleanupQuestionLearningTeacher(FIXTURE_KEY);
  });

  test("한국어와 영어 학습지가 빈 공간 없이 두 쪽으로 출력된다", async ({ context, page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "데스크톱 크로미엄 인쇄만 확인한다.");
    if (!teacher) throw new Error("교사 시험 자료가 준비되지 않았습니다.");
    await loginAsTeacher(page, teacher);

    for (const locale of ["ko", "en"] as const) {
      await context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: "http://localhost:3000" }]);
      await page.goto("/teacher-practice/print-guide");
      await page.evaluate(() => document.body.classList.add("question-practice-print-mode"));
      await page.emulateMedia({ media: "print" });

      const sheets = page.locator(".qp-sheet");
      await expect(sheets).toHaveCount(2);
      await expect(page.locator(".qp-eyebrow")).toHaveCSS("display", "none");

      const metrics = await sheets.evaluateAll((elements) =>
        elements.map((element) => {
          const sheet = element as HTMLElement;
          const sheetRect = sheet.getBoundingClientRect();
          const cards = sheet.querySelectorAll<HTMLElement>(".qp-card-grid > .qp-card");
          const lastCard = cards.item(cards.length - 1);
          const lastCardRect = lastCard?.getBoundingClientRect();
          return {
            height: sheetRect.height,
            overflow: sheet.scrollHeight - sheet.clientHeight,
            bottomGap: lastCardRect ? sheetRect.bottom - lastCardRect.bottom : Number.POSITIVE_INFINITY,
          };
        }),
      );

      for (const metric of metrics) {
        expect(metric.height).toBeGreaterThan(1060);
        expect(metric.height).toBeLessThan(1085);
        expect(metric.overflow).toBeLessThanOrEqual(1);
        expect(Math.abs(metric.bottomGap)).toBeLessThanOrEqual(2);
      }

      const pdfPath = testInfo.outputPath(`question-practice-${locale}.pdf`);
      const pdf = await page.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true });
      expect(countPdfPages(pdf)).toBe(2);
      await testInfo.attach(`question-practice-${locale}.pdf`, { path: pdfPath, contentType: "application/pdf" });

      for (let index = 0; index < 2; index += 1) {
        const imagePath = testInfo.outputPath(`question-practice-${locale}-${index + 1}.png`);
        await sheets.nth(index).screenshot({ path: imagePath });
        await testInfo.attach(`question-practice-${locale}-${index + 1}`, { path: imagePath, contentType: "image/png" });
      }
    }
  });
});
```

- [ ] **2단계: 관련 단위 시험과 정적 검사 실행**

```bash
npm test -- src/__tests__/question-practice-print-guide.test.ts
npx tsc --noEmit
npm run lint
```

예상: 모두 종료 코드 0.

- [ ] **3단계: 실제 두 쪽 화면 시험 실행**

실행: `npx playwright test e2e/question-practice-print.spec.ts --project=chromium`

예상: 한국어와 영어 PDF가 각각 두 쪽이고 두 면의 넘침과 마지막 카드 아래 간격 검사가 통과한다.

- [ ] **4단계: 한국어와 영어 PDF 그림 확인**

시험 결과에 첨부된 네 장의 면 그림에서 다음을 확인한다.

```text
첫째 쪽: 제목 → 안내 → 학년·반·번호 → 이름 → 질문 유형 이해하기
둘째 쪽: 질문연습 활동 세 개
공통: 잘림 없음, 겹침 없음, 셋째 쪽 없음, 카드 바깥의 큰 하단 빈 공간 없음
```

- [ ] **5단계: 넘침이 있으면 격자 안 간격만 조정**

교육 문구, 문항 수, 284밀리미터 면 높이는 바꾸지 않는다. `qp-header`, `qp-card`, `qp-pattern`, `qp-prompt-list`의 안쪽 여백과 간격만 조정하고 단위 시험과 두 PDF 확인을 다시 실행한다.

- [ ] **6단계: 제품 검증 실행**

```bash
npm test
npm run build
git diff --check
```

예상: 전체 시험, 자료 구조 검사, 보안 검사, 제품 빌드와 공백 검사 통과.

- [ ] **7단계: 화면 시험과 검증 보정 커밋**

화면 시험과 보정한 관련 파일만 별도 커밋한다.

```bash
git add e2e/question-practice-print.spec.ts src/__tests__/question-practice-print-guide.test.ts 'src/app/(teacher)/teacher-practice/print-guide/page.tsx' src/app/globals.css
git commit -m "test(practice): 학습지 두 쪽 출력 검증 보완"
```

- [ ] **8단계: 구현 커밋 푸시**

```bash
git push origin main
```
