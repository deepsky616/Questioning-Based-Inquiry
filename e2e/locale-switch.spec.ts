import { expect, test } from "@playwright/test";
import { preparePage, sessions } from "./helpers/session-filter-page";
import { expectNoHorizontalPageOverflow } from "./helpers/question-game-room";

for (const role of ["TEACHER", "STUDENT"] as const) {
  test(`${role === "TEACHER" ? "교사" : "학생"} 언어 선택이 메뉴와 수업 제목에 반영된다`, async ({ page, baseURL, browserName }) => {
    test.setTimeout(90000);
    const { errors } = await preparePage(page, role, baseURL!);
    const failures: {url:string;error:string|undefined}[]=[];
    page.on("requestfailed",request=>failures.push({url:request.url(),error:request.failure()?.errorText}));
    await page.route("**/api/teacher/students**", route => route.fulfill({ json: { students: [], teacherClasses: [] } }));
    const requests: {type: string; id: string}[][] = [];
    await page.route("**/api/translate", async route => {
      const { items } = route.request().postDataJSON() as {items: {type: string; id: string}[]};
      requests.push(items);
      const translations = Object.fromEntries(items.map(item => [
        `${item.type}:${item.id}`,
        item.type === "SESSION_SUBJECT" ? "Science" : "Weather",
      ]));
      await route.fulfill({ json: { translations } });
    });
    await page.goto(role === "TEACHER" ? "/teacher-sessions" : `/student-ask?sessionId=${sessions[0].id}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
    await page.locator("#lang-select").selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("#lang-select")).toHaveValue("en");
    if (role === "TEACHER") await page.getByRole("button", {name:/2026-09/}).click();
    await expect(page.locator("main")).toContainText("Weather");
    await expectNoHorizontalPageOverflow(page);
    await page.goto(role === "TEACHER" ? "/teacher-question-learning" : "/student-question-learning");
    await expect(page.getByRole("heading", {name: "Question Learning", exact:true})).toBeVisible();
    await expect(page.locator(".learning-page-header .lucide-book-open")).toBeVisible();
    await page.locator("#lang-select").selectOption("ko");
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
    await expect(page.getByRole("heading", {name: "질문학습", exact:true})).toBeVisible();
    // 사파리는 문서 새로고침으로 취소된 같은 출처 요청도 접근 검사 오류로 기록한다.
    // 실제 요청 실패가 모두 취소인 경우에만 이 로그를 제외한다. 화면 오류는 그대로 검사한다.
    const cancelledOnly = failures.length > 0 && failures.every(failure => failure.error === "cancelled");
    const unexpected = errors.filter(error => !(browserName === "webkit" && cancelledOnly &&
      error.includes(new URL(baseURL!).host) && error.endsWith("due to access control checks.")));
    expect(unexpected).toEqual([]);
    const keys = requests.flat().map(item => `${item.type}:${item.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
}

test("자동 번역이 실패하면 원문과 재시도 안내를 보여주고 복구한다", async ({ page, baseURL }) => {
  const { errors } = await preparePage(page, "STUDENT", baseURL!);
  await page.context().addCookies([{name:"NEXT_LOCALE",value:"en",url:baseURL!}]);
  let attempts = 0;
  await page.route("**/api/translate", async route => {
    attempts++;
    if (attempts === 1) {
      await route.fulfill({status:503,json:{error:"시험용 번역 실패"}});
      return;
    }
    const {items}=route.request().postDataJSON() as {items:{type:string;id:string}[]};
    await route.fulfill({json:{translations:Object.fromEntries(items.map(item=>[
      `${item.type}:${item.id}`,item.type === "SESSION_SUBJECT" ? "Science" : "Weather",
    ]))}});
  });
  await page.goto(`/student-ask?sessionId=${sessions[0].id}`);
  await expect(page.getByText("Some content could not be translated, so the original is shown.", {exact:true})).toBeVisible();
  await expect(page.locator("main")).toContainText("날씨");
  await page.getByRole("button",{name:"Retry translation",exact:true}).click();
  await expect(page.locator("main")).toContainText("Weather");
  expect(attempts).toBe(2);
  // 이 검사에서 의도적으로 반환한 503 이외에는 화면 오류가 없어야 한다.
  expect(errors.filter(error=>!error.includes("503"))).toEqual([]);
});

for (const role of ["TEACHER", "STUDENT"] as const) {
  test(`${role === "TEACHER" ? "교사" : "학생"}의 영어 질문 목록은 자동 번역하고 원문 보기를 유지한다`, async ({page, baseURL}, testInfo) => {
    const {errors}=await preparePage(page,role,baseURL!);
    await page.context().addCookies([{name:"NEXT_LOCALE",value:"en",url:baseURL!}]);
    await page.route("**/api/teacher/students**",route=>route.fulfill({json:{students:[],teacherClasses:[]}}));
    const original="왜 구름의 모양은 달라질까요?";
    const translated="Why do clouds have different shapes?";
    const comment={id:"c-auto",content:"공기의 움직임 때문인 것 같아요.",author:{id:"other",name:"시험 학생"},createdAt:"2026-09-06T00:00:00Z"};
    const question={id:"q-auto",content:original,closure:"open",cognitive:"conceptual",closureScore:0.2,cognitiveScore:0.8,sessionId:sessions[0].id,session:sessions[0],author:{id:`filter-test-${role}`,name:"시험 학생",grade:"4",className:"1",studentNumber:"1"},isPublic:true,createdAt:"2026-09-06T00:00:00Z",likeCount:0,commentCount:1,comments:[comment]};
    await page.route("**/api/questions/q-auto/comments",route=>route.fulfill({json:[comment]}));
    await page.route("**/api/questions?**",route=>{
      const url=new URL(route.request().url());
      return route.fulfill({json:url.searchParams.get("view")==="page"?{items:[question],pageInfo:{page:1,pageSize:30,total:1,totalPages:1},summary:{total:1,closure:{closed:0,open:1},cognitive:{factual:0,conceptual:1,controversial:0},flagged:0}}:[question]});
    });
    const requested:string[]=[];
    await page.route("**/api/translate",route=>{
      const {items}=route.request().postDataJSON() as {items:{type:string;id:string}[]};
      requested.push(...items.map(item=>`${item.type}:${item.id}`));
      return route.fulfill({json:{translations:Object.fromEntries(items.map(item=>[
        `${item.type}:${item.id}`,item.type==="QUESTION"?translated:item.type==="COMMENT"?"I think it is because the air moves.":item.type==="SESSION_SUBJECT"?"Science":"Weather",
      ]))}});
    });
    await page.goto(role==="TEACHER"?"/teacher-questions":"/student-questions?tab=mine");
    await expect(page.getByText(translated,{exact:true}).filter({visible:true})).toBeVisible();
    await page.getByRole("button",{name:"Show original",exact:true}).click();
    await expect(page.getByText(original,{exact:true}).filter({visible:true})).toBeVisible();
    await page.getByRole("button",{name:"🌐 Translate",exact:true}).click();
    await expect(page.getByText(translated,{exact:true}).filter({visible:true})).toBeVisible();
    await page.getByRole("button",{name:/💬 1/}).filter({visible:true}).click();
    await expect(page.getByText("I think it is because the air moves.",{exact:true}).filter({visible:true})).toBeVisible();
    expect(requested.filter(key=>key==="QUESTION:q-auto")).toHaveLength(1);
    expect(requested.filter(key=>key==="COMMENT:c-auto")).toHaveLength(1);
    await expectNoHorizontalPageOverflow(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({path:testInfo.outputPath("영어-질문-댓글.png"),fullPage:true});
    expect(errors).toEqual([]);
  });
}
