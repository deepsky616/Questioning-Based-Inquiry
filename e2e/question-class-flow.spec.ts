import {
  expect,
  test,
  type Page,
  type Route,
} from "@playwright/test";
import {
  cleanupQuestionLearningTeacher,
  prepareQuestionLearningTeacher,
  type QuestionLearningTeacherFixture,
} from "./helpers/test-db";
import { loginAsStudent } from "./helpers/login";

type UnexpectedWrite = {
  method: string;
  url: string;
};

function localDate(offsetDays: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

async function fulfillReadOnly(
  route: Route,
  body: unknown,
  unexpectedWrites: UnexpectedWrite[],
) {
  const request = route.request();
  if (request.method() !== "GET") {
    unexpectedWrites.push({ method: request.method(), url: request.url() });
    await route.abort("blockedbyclient");
    return;
  }
  await route.fulfill({ json: body });
}

function questionReadResponse(requestUrl: string): unknown {
  const searchParams = new URL(requestUrl).searchParams;
  const view = searchParams.get("view");

  if (view === "dashboard") {
    return {
      recent: [],
      stats: {
        total: 0,
        byClosure: { closed: 0, open: 0 },
        byCognitive: { factual: 0, conceptual: 0, controversial: 0 },
      },
      answeredSessionIds: [],
    };
  }
  if (view === "page") {
    return {
      items: [],
      pageInfo: {
        page: Number(searchParams.get("page") ?? 1),
        pageSize: Number(searchParams.get("pageSize") ?? 30),
        total: 0,
        totalPages: 1,
      },
      summary: {
        total: 0,
        closure: { closed: 0, open: 0 },
        cognitive: { factual: 0, conceptual: 0, controversial: 0 },
        flagged: 0,
      },
    };
  }
  if (view === "student-session") {
    return { existingQuestion: null };
  }
  return [];
}

async function fulfillQuestionRead(
  route: Route,
  unexpectedWrites: UnexpectedWrite[],
) {
  return fulfillReadOnly(
    route,
    questionReadResponse(route.request().url()),
    unexpectedWrites,
  );
}

async function loginAsTeacher(
  page: Page,
  teacher: QuestionLearningTeacherFixture,
) {
  await page.goto("/login?type=teacher");
  await expect(page.locator("#t-email")).toBeVisible({ timeout: 30_000 });
  await page.locator("#t-email").fill(teacher.email);
  await page.locator("#t-password").fill(teacher.password);
  await page.getByRole("button", { name: "교사 로그인", exact: true }).click();
  await page.waitForURL("**/teacher-dashboard", { timeout: 20_000 });
  await page.reload({ waitUntil: "load" }).catch(() => {});
  await page.waitForURL("**/teacher-dashboard", { timeout: 10_000 });
}

async function stubTeacherReads(
  page: Page,
  fixture: QuestionLearningTeacherFixture,
  unexpectedWrites: UnexpectedWrite[],
) {
  const student = {
    id: fixture.student.id,
    name: fixture.student.name,
    grade: fixture.grade,
    className: fixture.className,
    studentNumber: "1",
    questionCount: 0,
    commentCount: 0,
    lastActivityAt: null,
    sessionProgress: { total: 1, completed: 0, remaining: 1, percent: 0 },
  };
  const teacherClasses = [{ grade: fixture.grade, className: fixture.className }];

  await page.route("**/api/stats?**", (route) =>
    fulfillReadOnly(
      route,
      {
        total: 0,
        byClosure: { closed: 0, open: 0 },
        byCognitive: { factual: 0, conceptual: 0, controversial: 0 },
        byStudent: [],
        timeline: [],
        school: fixture.school,
        teacherClasses,
      },
      unexpectedWrites,
    ),
  );
  await page.route("**/api/teacher/students**", (route) => {
    const view = new URL(route.request().url()).searchParams.get("view");
    return fulfillReadOnly(
      route,
      view === "activity"
        ? {
            activity: [{
              studentId: student.id,
              questionCount: 0,
              commentCount: 0,
              totalPoints: 0,
              lastActivityAt: null,
              sessionProgress: student.sessionProgress,
            }],
          }
        : { students: [student], teacherClasses },
      unexpectedWrites,
    );
  });
  await page.route("**/api/teacher/flagged-count**", (route) =>
    fulfillReadOnly(
      route,
      { total: 2, questions: 2, comments: 0 },
      unexpectedWrites,
    ),
  );
  await page.route("**/api/teacher/points/pending-count**", (route) =>
    fulfillReadOnly(route, { count: 1 }, unexpectedWrites),
  );
  await page.route("**/api/notifications**", (route) =>
    fulfillReadOnly(
      route,
      { notifications: [], unreadCount: 0 },
      unexpectedWrites,
    ),
  );
  await page.route("**/api/questions**", (route) =>
    fulfillQuestionRead(route, unexpectedWrites),
  );
  await page.route("**/api/sessions**", (route) =>
    fulfillReadOnly(
      route,
      [
        {
          id: "e2e-teacher-today-class",
          date: localDate(0),
          subject: "과학",
          topic: "물질의 변화",
          isActive: true,
          participation: { total: 1, submitted: 0, missing: 1, percent: 0 },
        },
        {
          id: "e2e-teacher-today-second-class",
          date: localDate(0),
          subject: "사회",
          topic: "지역의 변화",
          isActive: true,
          participation: { total: 1, submitted: 0, missing: 1, percent: 0 },
        },
      ],
      unexpectedWrites,
    ),
  );
  await page.route("**/api/unit-design**", (route) =>
    fulfillReadOnly(route, [], unexpectedWrites),
  );
  await page.route("**/api/curriculum**", (route) =>
    fulfillReadOnly(route, { areas: [] }, unexpectedWrites),
  );
}

async function stubStudentReads(
  page: Page,
  unexpectedWrites: UnexpectedWrite[],
) {
  const teacherRequestSessionId = "e2e-question-class-request";
  const today = localDate(0);
  const sessions = [
    {
      id: teacherRequestSessionId,
      date: today,
      subject: "과학",
      topic: "선생님 요청 수업",
      teacher: { name: "합성 시험 교사" },
    },
    {
      id: "e2e-question-class-today",
      date: today,
      subject: "사회",
      topic: "오늘 질문할 수업",
      teacher: { name: "합성 시험 교사" },
    },
    {
      id: "e2e-question-class-past",
      date: localDate(-1),
      subject: "국어",
      topic: "최근 놓친 수업",
      teacher: { name: "합성 시험 교사" },
    },
  ];
  const notifications = [
    {
      id: "e2e-question-class-notification",
      type: "SESSION_REMINDER",
      title: "질문 작성 요청",
      message: "선생님이 질문 작성을 요청했어요.",
      href: `/student-ask?sessionId=${teacherRequestSessionId}`,
      sessionId: teacherRequestSessionId,
      metadata: {
        teacherName: "합성 시험 교사",
        sessionTitle: "선생님 요청 수업",
      },
      readAt: null,
      createdAt: new Date().toISOString(),
    },
  ];

  await page.route("**/api/questions**", (route) =>
    fulfillQuestionRead(route, unexpectedWrites),
  );
  await page.route("**/api/sessions**", (route) =>
    fulfillReadOnly(route, sessions, unexpectedWrites),
  );
  await page.route("**/api/notifications**", (route) =>
    fulfillReadOnly(
      route,
      { notifications, unreadCount: 1 },
      unexpectedWrites,
    ),
  );
  await page.route("**/api/points/me**", (route) =>
    fulfillReadOnly(route, { totalPoints: 0, recent: [] }, unexpectedWrites),
  );
  await page.route("**/api/points/leaderboard**", (route) =>
    fulfillReadOnly(
      route,
      { scope: "test", me: { rank: null, totalPoints: 0 } },
      unexpectedWrites,
    ),
  );
  await page.route("**/api/config**", (route) =>
    fulfillReadOnly(route, { configured: false }, unexpectedWrites),
  );
}

async function expectPriorityRows(
  page: Page,
  title: string,
  expectedNames: string[],
) {
  const card = page
    .getByRole("heading", { name: title, exact: true })
    .locator("..")
    .locator("..");
  const rows = card.getByTestId("priority-task-list").getByRole("button");

  await expect(rows).toHaveCount(expectedNames.length);
  for (const [index, name] of expectedNames.entries()) {
    await expect(rows.nth(index)).toBeVisible();
    await expect(rows.nth(index)).toHaveAccessibleName(name);
  }
}

async function expectScheduleRow(
  page: Page,
  cardTitle: string,
  expectedName: RegExp,
) {
  const card = page
    .getByRole("heading", { name: cardTitle, exact: true })
    .locator("..")
    .locator("..");
  const row = card.getByTestId("dashboard-question-class-row");

  await expect(row).toBeVisible();
  await expect(row).toHaveAccessibleName(expectedName);
  return row;
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    document: {
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    },
    body: {
      client: document.body.clientWidth,
      scroll: document.body.scrollWidth,
    },
  }));

  for (const [name, width] of Object.entries(widths)) {
    expect(width.scroll - width.client, `${name} 가로 넘침`).toBeLessThanOrEqual(1);
  }
}

async function expectQuestionClassNavActive(page: Page) {
  const header = page.locator("header");
  await expect(header).toBeVisible({ timeout: 30_000 });

  const visibleHeaderLinks = () =>
    header
      .getByRole("link", { name: "질문수업", exact: true })
      .filter({ visible: true });
  let openedMenu: "mobile" | "more" | null = null;
  let link = visibleHeaderLinks().first();

  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    const mobileMenu = header.getByRole("button", {
      name: "메뉴 열기",
      exact: true,
    });
    await expect(mobileMenu).toBeVisible();
    await mobileMenu.click();
    openedMenu = "mobile";
    link = visibleHeaderLinks().first();
  } else {
    const more = header.getByRole("button", { name: "더보기", exact: true });
    await expect
      .poll(async () => (await visibleHeaderLinks().count()) > 0 || (await more.isVisible()))
      .toBe(true);

    if ((await visibleHeaderLinks().count()) === 0) {
      await more.click();
      openedMenu = "more";
      link = page
        .locator("[data-radix-popper-content-wrapper]")
        .filter({ visible: true })
        .getByRole("link", { name: "질문수업", exact: true });
    }
  }

  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/teacher-sessions");
  await expect(link).toHaveClass(/bg-muted/);
  await expect(link).toHaveClass(/text-primary/);

  if (openedMenu === "mobile") {
    await header
      .getByRole("button", { name: "메뉴 닫기", exact: true })
      .click();
  } else if (openedMenu === "more") {
    await page.keyboard.press("Escape");
  }
}

test.describe("질문수업 통합 흐름", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  let fixture: QuestionLearningTeacherFixture;
  let fixtureKey: string;

  test.beforeAll(async ({}, testInfo) => {
    fixtureKey = `question-class-${testInfo.project.name}`;
    fixture = await prepareQuestionLearningTeacher(fixtureKey);
  });

  test.afterAll(async () => {
    await cleanupQuestionLearningTeacher(fixtureKey);
  });

  test("교사가 우선 확인에서 두 질문수업 만들기 흐름을 찾는다", async ({
    page,
  }) => {
    const unexpectedWrites: UnexpectedWrite[] = [];
    await stubTeacherReads(page, fixture, unexpectedWrites);
    await loginAsTeacher(page, fixture);

    await expectPriorityRows(page, "우선 확인", [
      "부적절 의심 활동 2건",
      "검토할 추천 포인트 1건",
      "지도가 필요한 학생 1명",
    ]);
    const scheduleRow = await expectScheduleRow(
      page,
      "우선 확인",
      /오늘 질문수업.*2개.*과학.*물질의 변화.*질문수업 목록 펼치기/,
    );
    await expectNoHorizontalOverflow(page);

    await scheduleRow.click();
    await expect(scheduleRow).toHaveAttribute("aria-expanded", "true");
    await scheduleRow
      .locator("..")
      .getByRole("button", { name: "사회 지역의 변화", exact: true })
      .click();
    await expect(page).toHaveURL(
      /\/teacher-questions\?session=e2e-teacher-today-second-class$/,
    );
    await expect(page.getByLabel("질문수업", { exact: true })).toHaveValue(
      "e2e-teacher-today-second-class",
    );

    const questionClassSelect = page.getByLabel("질문수업", { exact: true });
    await questionClassSelect.selectOption("e2e-teacher-today-class");
    await expect(page).toHaveURL(
      /\/teacher-questions\?session=e2e-teacher-today-class$/,
    );
    await page.goBack();
    await expect(page).toHaveURL(
      /\/teacher-questions\?session=e2e-teacher-today-second-class$/,
    );
    await expect(questionClassSelect).toHaveValue("e2e-teacher-today-second-class");
    await page.goForward();
    await expect(page).toHaveURL(
      /\/teacher-questions\?session=e2e-teacher-today-class$/,
    );
    await expect(questionClassSelect).toHaveValue("e2e-teacher-today-class");

    await page.goto("/teacher-sessions");
    await expectQuestionClassNavActive(page);

    const primaryAction = page.getByTestId("question-class-primary-action");
    await expect(primaryAction).toBeVisible();
    await expect(primaryAction).toHaveAccessibleName(
      "탐구질문으로 수업 만들기",
    );
    await expect(primaryAction).toHaveAttribute("href", "/teacher-curriculum");

    const quickCreate = page.locator(
      'button[aria-controls="quick-question-class-form"]',
    );
    await expect(quickCreate).toHaveAccessibleName("간단 질문수업 만들기");
    await expect(quickCreate).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#quick-question-class-form")).toHaveCount(0);

    await quickCreate.click();
    await expect(quickCreate).toHaveAccessibleName("간단 질문수업 닫기");
    await expect(quickCreate).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#quick-question-class-form")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await primaryAction.click();
    await expect(page).toHaveURL(/\/teacher-curriculum(?:\?|$)/);
    await expectQuestionClassNavActive(page);
    await expectNoHorizontalOverflow(page);
    expect(unexpectedWrites).toEqual([]);
  });

  test("학생이 오늘 일정과 중복 없는 두 가지 우선 할 일을 본다", async ({ page }) => {
    const unexpectedWrites: UnexpectedWrite[] = [];
    await stubStudentReads(page, unexpectedWrites);
    await loginAsStudent(page, {
      school: fixture.school,
      grade: fixture.grade,
      className: fixture.className,
      studentNumber: "1",
      password: fixture.password,
    });

    await expectPriorityRows(page, "지금 할 일", [
      "선생님 요청 1개",
      "최근 놓친 수업 1개",
    ]);
    const scheduleRow = await expectScheduleRow(
      page,
      "지금 할 일",
      /오늘 질문수업.*질문 필요 2개.*과학.*선생님 요청 수업.*질문수업 목록 펼치기/,
    );
    await expectNoHorizontalOverflow(page);

    await scheduleRow.click();
    await expect(scheduleRow).toHaveAttribute("aria-expanded", "true");
    await scheduleRow
      .locator("..")
      .getByRole("button", {
        name: "사회 오늘 질문할 수업 질문 필요",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(
      /\/student-ask\?sessionId=e2e-question-class-today$/,
    );
    await expect(page.locator("#session")).toHaveValue("e2e-question-class-today");
    expect(unexpectedWrites).toEqual([]);
  });
});
