# 윈도우 USB 시연 실행판 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**목표:** 윈도우 USB의 `program/index.html`에서 김질문 학생으로 안전하게 자동 로그인하고, 4학년 1반 28명의 시연 학급 자료를 운영 자료와 분리해 제공한다.

**구조:** 기존 배포와 데이터베이스를 사용하되 사용자에 시연 표시를 추가하고 모든 범위 밖 순위 조회에서 시연 여부를 함께 제한한다. 주소 조각의 실행 표는 시연 전용 인증 제공자가 서버 환경 변수의 해시와 비교하며, 인공지능 키는 지정 교사 계정에서 서버 안에서만 해석한다.

**사용 기술:** 넥스트 16, 인증 도구 5, 프리즈마 5, 포스트그레스, 비테스트, 플레이wright, 버셀

## 전체 제약

- 시작 파일은 `/Users/youngmini/Documents/QuestionLab/program/index.html`이다.
- 실행 주소는 `https://questioning-based-inquiry.vercel.app/demo/launch`이다.
- 윈도우 최신 크롬과 엣지, 안드로이드 태블릿 최신 크롬에서 실행한다.
- 운영체제 전용 설치 프로그램은 만들지 않고 표준 웹브라우저만 지원한다.
- 자동 로그인 계정은 질문초등학교 4학년 1반 1번 김질문 학생뿐이다.
- 시연 학급은 1번부터 28번까지 생성한다.
- 비밀번호와 인공지능 키를 USB, 주소 요청부, 브라우저 저장소, 응답에 넣지 않는다.
- 기존 사용자는 `isDemo=false`를 기본값으로 유지한다.
- 실행 만료 시각은 한국 시각 `2026-12-31 23:59:59`이다.
- 시연 인공지능 요청은 분당 10회, 하루 120회로 제한한다.
- 사용자가 만든 추적되지 않은 PDF는 변경하거나 커밋하지 않는다.

---

### 작업 1: 시연 자료 표식과 인공지능 사용량 자료 구조

**파일:**
- 수정: `prisma/schema.prisma`
- 생성: `prisma/migrations/20260727100000_add_demo_runtime/migration.sql`
- 검사: `src/__tests__/demo-schema.test.ts`

**연결 규약:**
- 제공: `User.isDemo: boolean`
- 제공: `DemoAiDailyUsage(userId, usageDate, requestCount)`

- [ ] **1단계: 실패하는 구조 검사 작성**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("시연 실행 자료 구조", () => {
  it("기존 사용자는 일반 사용자이며 하루 인공지능 사용량을 별도 저장한다", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    expect(schema).toContain("isDemo Boolean @default(false)");
    expect(schema).toContain("model DemoAiDailyUsage");
    expect(schema).toContain("@@id([userId, usageDate]");
  });
});
```

- [ ] **2단계: 실패 확인**

실행: `npm test -- src/__tests__/demo-schema.test.ts`

예상: `isDemo`와 `DemoAiDailyUsage`가 없어 실패

- [ ] **3단계: 최소 구조와 추가형 변경문 작성**

```prisma
isDemo Boolean @default(false) @map("is_demo")
demoAiDailyUsages DemoAiDailyUsage[] @relation("DemoAiDailyUsages")

model DemoAiDailyUsage {
  userId      String   @map("user_id")
  user        User     @relation("DemoAiDailyUsages", fields: [userId], references: [id], onDelete: Cascade)
  usageDate   String   @map("usage_date")
  requestCount Int     @default(0) @map("request_count")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@id([userId, usageDate], map: "demo_ai_daily_usages_pkey")
  @@map("demo_ai_daily_usages")
}
```

변경문은 `users.is_demo`를 기본값 `false`로 추가하고 새 표, 외래키, 행 보안 활성화를 포함한다.

- [ ] **4단계: 구조 검사와 프리즈마 생성**

실행: `npm test -- src/__tests__/demo-schema.test.ts && npm run db:generate`

예상: 모두 성공

- [ ] **5단계: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations/20260727100000_add_demo_runtime/migration.sql src/__tests__/demo-schema.test.ts
git commit -m "feat: 시연 사용자와 인공지능 사용량 구조 추가"
```

### 작업 2: 실행 표 검증과 시연 설정

**파일:**
- 생성: `src/lib/demo-config.ts`
- 수정: `.env.example`
- 검사: `src/__tests__/demo-config.test.ts`

**연결 규약:**
- 제공: `validateDemoLaunchTicket(ticket: string, now?: Date): DemoLaunchValidation`
- 제공: `DEMO_SCHOOL`, `DEMO_GRADE`, `DEMO_CLASS_NAME`, `DEMO_STUDENT_NUMBER`
- 제공: `isReservedDemoSchool(school: string): boolean`

- [ ] **1단계: 누락, 불일치, 만료, 성공 검사 작성**

```ts
expect(validateDemoLaunchTicket("", now)).toEqual({ ok: false, reason: "missing" });
expect(validateDemoLaunchTicket("wrong", now)).toEqual({ ok: false, reason: "invalid" });
expect(validateDemoLaunchTicket(ticket, expiredNow)).toEqual({ ok: false, reason: "expired" });
expect(validateDemoLaunchTicket(ticket, validNow)).toEqual({ ok: true });
expect(isReservedDemoSchool(" 질문초등학교 ")).toBe(true);
```

- [ ] **2단계: 실패 확인**

실행: `npm test -- src/__tests__/demo-config.test.ts`

예상: 모듈이 없어 실패

- [ ] **3단계: 일정 시간 해시 비교와 설정 해석 구현**

`createHash("sha256")`, `timingSafeEqual`, `DEMO_LAUNCH_ENABLED`,
`DEMO_LAUNCH_TOKEN_HASH`, `DEMO_LAUNCH_EXPIRES_AT`을 사용한다. 환경 변수 예시는 실제 값을
넣지 않고 이름과 설명만 추가한다.

- [ ] **4단계: 검사 통과 확인**

실행: `npm test -- src/__tests__/demo-config.test.ts`

예상: 모두 성공

- [ ] **5단계: 커밋**

```bash
git add .env.example src/lib/demo-config.ts src/__tests__/demo-config.test.ts
git commit -m "feat: 시연 실행 표 검증 추가"
```

### 작업 3: 김질문 자동 로그인

**파일:**
- 수정: `src/lib/auth.ts`
- 수정: `src/lib/auth-shared.ts`
- 수정: `src/lib/auth-helpers.ts`
- 수정: `src/types/next-auth.d.ts`
- 수정: `src/lib/route-access.ts`
- 검사: `src/__tests__/demo-auth.test.ts`
- 검사: `src/__tests__/auth-edge-boundary.test.ts`

**연결 규약:**
- 제공: 인증 제공자 식별값 `demo-launch`
- 제공: 세션과 토큰의 `isDemo: boolean`

- [ ] **1단계: 실패하는 인증 경계 검사 작성**

```ts
expect(authSource).toContain('id: "demo-launch"');
expect(authSource).toContain("validateDemoLaunchTicket");
expect(sharedAuth).toContain("token.isDemo = user.isDemo");
expect(routeAccessSource).toContain('"/demo/launch"');
```

- [ ] **2단계: 실패 확인**

실행: `npm test -- src/__tests__/demo-auth.test.ts src/__tests__/auth-edge-boundary.test.ts`

예상: 시연 제공자와 세션 값이 없어 실패

- [ ] **3단계: 시연 자격 제공자 구현**

시연 제공자는 실행 표 검증 뒤 다음 조건으로만 사용자를 조회한다.

```ts
{
  role: "STUDENT",
  isDemo: true,
  school: DEMO_SCHOOL,
  grade: DEMO_GRADE,
  className: DEMO_CLASS_NAME,
  studentNumber: DEMO_STUDENT_NUMBER,
}
```

요청 제한은 실행 표 해시 기준 분당 20회로 적용하고, 반환 사용자와 세션에 `isDemo`를 넣는다.

- [ ] **4단계: 인증 검사 통과 확인**

실행: `npm test -- src/__tests__/demo-auth.test.ts src/__tests__/auth-edge-boundary.test.ts`

예상: 모두 성공하며 가장자리 인증 묶음에 데이터베이스와 비밀번호 모듈이 들어가지 않음

- [ ] **5단계: 커밋**

```bash
git add src/lib/auth.ts src/lib/auth-shared.ts src/lib/auth-helpers.ts src/types/next-auth.d.ts src/lib/route-access.ts src/__tests__/demo-auth.test.ts src/__tests__/auth-edge-boundary.test.ts
git commit -m "feat: 김질문 시연 자동 로그인 추가"
```

### 작업 4: 시연 자료와 일반 자료 경계

**파일:**
- 수정: `src/app/api/auth/register/route.ts`
- 수정: `src/app/api/account/change-password/route.ts`
- 수정: `src/app/api/points/leaderboard/route.ts`
- 수정: `src/app/api/points/class-leaderboard/route.ts`
- 수정: `src/app/api/points/class-ranks/route.ts`
- 검사: `src/__tests__/demo-access-boundary.test.ts`

**연결 규약:**
- 소비: `isReservedDemoSchool`
- 동작: 모든 순위 쿼리는 현재 사용자의 `isDemo` 값과 같은 학생만 포함

- [ ] **1단계: 실패하는 접근 경계 검사 작성**

```ts
expect(registerSource).toContain("isReservedDemoSchool");
expect(changePasswordSource).toContain("isDemo: true");
expect(leaderboardSource).toContain("isDemo: me.isDemo");
expect(classLeaderboardSource).toContain("isDemo: me.isDemo");
expect(classRanksSource).toContain("isDemo: me.isDemo");
```

- [ ] **2단계: 실패 확인**

실행: `npm test -- src/__tests__/demo-access-boundary.test.ts`

예상: 시연 경계가 없어 실패

- [ ] **3단계: 예약 학교와 계정 변경 차단, 순위 분리 구현**

회원가입은 질문초등학교를 거절한다. 비밀번호 변경은 데이터베이스에서 `isDemo`를 조회해
403을 반환한다. 세 순위 주소는 현재 사용자 조회에 `isDemo`를 포함하고 모든 학생 범위에
`isDemo: me.isDemo`를 적용한다.

- [ ] **4단계: 경계 검사와 기존 순위 검사 실행**

실행: `npm test -- src/__tests__/demo-access-boundary.test.ts src/__tests__/points-me-route.test.ts src/__tests__/points-class-ranks-access-route.test.ts src/__tests__/points-leaderboard-access-route.test.ts`

예상: 모두 성공

- [ ] **5단계: 커밋**

```bash
git add src/app/api/auth/register/route.ts src/app/api/account/change-password/route.ts src/app/api/points/leaderboard/route.ts src/app/api/points/class-leaderboard/route.ts src/app/api/points/class-ranks/route.ts src/__tests__/demo-access-boundary.test.ts
git commit -m "fix: 시연 자료와 일반 순위 분리"
```

### 작업 5: 시연 인공지능 키 해석과 하루 한도

**파일:**
- 수정: `src/lib/resolve-ai-config.ts`
- 수정: `src/lib/ai.ts`
- 생성: `src/lib/demo-ai-quota.ts`
- 수정: `src/lib/ai-errors.ts`
- 검사: `src/__tests__/resolve-ai-config.test.ts`
- 검사: `src/__tests__/demo-ai-quota.test.ts`

**연결 규약:**
- 제공: `ResolvedAiConfig.isDemo: boolean`
- 제공: `consumeDemoAiQuota(userId: string, now?: Date): Promise<number | null>`
- 제공: `DemoAiQuotaError`

- [ ] **1단계: 실패하는 키 분리와 한도 검사 작성**

```ts
expect(await resolveUserAiConfig("demo-student")).toEqual({
  apiKey: "server-only-key",
  model: "gemini-2.5-flash-lite",
  isDemo: true,
});
await expect(consumeDemoAiQuota("demo-student", now)).resolves.toBe(1);
await expect(consumeDemoAiQuota("demo-student", now)).rejects.toThrow(DemoAiQuotaError);
```

- [ ] **2단계: 실패 확인**

실행: `npm test -- src/__tests__/resolve-ai-config.test.ts src/__tests__/demo-ai-quota.test.ts`

예상: 시연 키 해석과 한도 모듈이 없어 실패

- [ ] **3단계: 서버 전용 키 해석과 원자적 증가 구현**

시연 사용자는 `DEMO_AI_SOURCE_EMAIL`의 일반 교사 키와 모델만 사용한다. 하루 값은
`YYYY-MM-DD` 한국 날짜로 계산한다. 다음 형태의 한 문장으로 사용량을 증가시켜 동시 요청도
120회를 넘지 않게 한다.

```sql
INSERT INTO demo_ai_daily_usages (...)
VALUES (...)
ON CONFLICT (user_id, usage_date)
DO UPDATE SET request_count = demo_ai_daily_usages.request_count + 1
WHERE demo_ai_daily_usages.request_count < $limit
RETURNING request_count
```

통합 인공지능 호출 계층은 시연 사용자의 요청 덮어쓰기 키를 무시하고, 분당 10회와 하루
120회를 확인하며 최대 출력량을 2048로 제한한다.

- [ ] **4단계: 인공지능 검사 통과 확인**

실행: `npm test -- src/__tests__/resolve-ai-config.test.ts src/__tests__/demo-ai-quota.test.ts src/__tests__/config.test.ts`

예상: 모두 성공

- [ ] **5단계: 커밋**

```bash
git add src/lib/resolve-ai-config.ts src/lib/ai.ts src/lib/demo-ai-quota.ts src/lib/ai-errors.ts src/__tests__/resolve-ai-config.test.ts src/__tests__/demo-ai-quota.test.ts
git commit -m "feat: 시연 인공지능 키와 사용량 제한 추가"
```

### 작업 6: 28명 시연 학급과 활동 자료 생성

**파일:**
- 생성: `scripts/seed-usb-demo.mjs`
- 수정: `package.json`
- 검사: `src/__tests__/demo-seed.test.ts`

**연결 규약:**
- 제공: `npm run demo:seed`
- 제공: 고정 식별값 접두사 `usb-demo-`

- [ ] **1단계: 실패하는 명단과 중복 방지 검사 작성**

```ts
expect(seedSource).toContain('"김질문"');
expect(seedSource).toContain('"고서아"');
expect(studentNames).toHaveLength(28);
expect(seedSource).toContain("isDemo: true");
expect(seedSource).toContain("deleteMany");
expect(packageJson.scripts["demo:seed"]).toBe("node scripts/seed-usb-demo.mjs");
```

- [ ] **2단계: 실패 확인**

실행: `npm test -- src/__tests__/demo-seed.test.ts`

예상: 생성 명령이 없어 실패

- [ ] **3단계: 반복 실행 가능한 자료 생성 구현**

명령은 일반 사용자가 질문초등학교를 사용 중이면 중단한다. 시연 사용자 식별값에 연결된
이전 생성 자료만 지운 뒤 교사, 담당 학급, 학생 28명, 질문수업 3개, 탐구 자료 1개,
학생 질문과 답변, 연습 기록, 세 방식 질문놀이 완료 기록과 포인트를 다시 만든다.
비밀번호는 실행 때 생성한 임의 문자열의 해시만 저장하고 출력하지 않는다.

- [ ] **4단계: 정적 검사와 시험 데이터베이스 반복 실행 확인**

실행: `npm test -- src/__tests__/demo-seed.test.ts`

데이터베이스 변경 적용 뒤 실행: `npm run demo:seed && npm run demo:seed`

예상: 두 번 모두 성공하고 학생 수가 28명으로 유지

- [ ] **5단계: 커밋**

```bash
git add package.json scripts/seed-usb-demo.mjs src/__tests__/demo-seed.test.ts
git commit -m "feat: 시연 학급과 학습 자료 생성 명령 추가"
```

### 작업 7: 시연 실행 화면

**파일:**
- 생성: `src/app/demo/launch/page.tsx`
- 생성: `src/app/demo/launch/DemoLaunchClient.tsx`
- 검사: `src/__tests__/demo-launch.render.test.tsx`

**연결 규약:**
- 소비: 주소 조각의 `ticket`
- 소비: 인증 제공자 `demo-launch`
- 성공 이동: `/student-dashboard`

- [ ] **1단계: 실패하는 화면 검사 작성**

```tsx
expect(source).toContain('signIn("demo-launch"');
expect(source).toContain('router.replace("/student-dashboard")');
expect(source).toContain("다시 시도");
expect(source).toContain("인터넷 연결");
```

- [ ] **2단계: 실패 확인**

실행: `npm test -- src/__tests__/demo-launch.render.test.tsx`

예상: 화면 파일이 없어 실패

- [ ] **3단계: 자동 실행과 오류 복구 화면 구현**

화면은 주소 조각을 읽은 직후 브라우저 기록에서 조각을 지우고 인증을 시도한다. 실행 중,
실행 표 누락, 권한 확인 실패, 네트워크 실패를 한 화면에서 구분한다. 버튼은 같은 실행을
다시 시도하며 학생에게 비밀번호나 실행 표를 요구하지 않는다.

- [ ] **4단계: 화면 검사 통과 확인**

실행: `npm test -- src/__tests__/demo-launch.render.test.tsx`

예상: 모두 성공

- [ ] **5단계: 커밋**

```bash
git add src/app/demo/launch/page.tsx src/app/demo/launch/DemoLaunchClient.tsx src/__tests__/demo-launch.render.test.tsx
git commit -m "feat: USB 시연 자동 실행 화면 추가"
```

### 작업 8: 윈도우 USB 제출 폴더 생성

**파일:**
- 생성: `scripts/build-usb-demo-bundle.mjs`
- 수정: `package.json`
- 검사: `src/__tests__/usb-demo-bundle.test.ts`
- 생성 결과: `/Users/youngmini/Documents/QuestionLab/program/index.html`
- 생성 결과: `/Users/youngmini/Documents/QuestionLab/media/image/login-inquiry-hero.png`
- 생성 결과: `/Users/youngmini/Documents/QuestionLab/media/image/question-learning-cover.png`
- 생성 결과: `/Users/youngmini/Documents/QuestionLab/media/sound/start.wav`

**연결 규약:**
- 제공: `npm run demo:usb`
- 제공: 실행할 때 생성한 32바이트 임의 실행 표

- [x] **1단계: 실패하는 묶음 생성 검사 작성**

```ts
expect(builderSource).toContain("DEMO_LAUNCH_TICKET");
expect(builderSource).toContain("/demo/launch#ticket=");
expect(builderSource).toContain("login-inquiry-hero.png");
expect(builderSource).not.toContain("DEMO_AI_SOURCE_EMAIL");
```

- [x] **2단계: 실패 확인**

실행: `npm test -- src/__tests__/usb-demo-bundle.test.ts`

예상: 생성 명령이 없어 실패

- [x] **3단계: 실행 파일과 매체 복사 구현**

생성 명령은 `randomBytes(32).toString("base64url")`로 실행 표를 만들고, `index.html`에
즉시 이동과 대체 버튼을 넣는다. 두 이미지는 `public`에서 복사한다. `start.wav`는
8킬로헤르츠, 16비트, 단일 통로, 0.25초 길이의 660헤르츠 사인파를 노드 `Buffer`로 만든다.
명령 출력에는 실행 표 원문 대신 sha256 해시만 표시한다.

- [x] **4단계: 제출 폴더 생성과 내용 검사**

실행: `npm run demo:usb`

검사:

```bash
find /Users/youngmini/Documents/QuestionLab -maxdepth 3 -type f -print
rg -n "questioning-based-inquiry.vercel.app/demo/launch" /Users/youngmini/Documents/QuestionLab/program/index.html
```

예상: 지정된 네 파일이 존재하고 인공지능 키 문자열이 없음

- [x] **5단계: 커밋**

```bash
git add package.json scripts/build-usb-demo-bundle.mjs src/__tests__/usb-demo-bundle.test.ts
git commit -m "feat: 윈도우 USB 제출 묶음 생성 추가"
```

### 작업 9: 전체 검사, 데이터 적용, 배포

**파일:**
- 새 파일 없음
- 앞선 작업에서 만든 파일만 오류가 확인된 경우 수정

- [x] **1단계: 전체 단위 검사**

실행: `npm test`

예상: 실패 0개

- [x] **2단계: 정적 검사와 빌드**

실행: `npm run lint && npm run build`

예상: 두 명령 모두 종료값 0

- [x] **3단계: 데이터베이스 변경과 시연 자료 적용**

실행: `npm run db:migrate:deploy && npm run demo:seed`

예상: 추가형 변경 적용 뒤 28명 시연 학급 생성

- [ ] **4단계: 버셀 환경 변수 등록과 운영 배포**

다음 값을 실제 문자열을 출력하지 않는 방식으로 등록한다.

```text
DEMO_LAUNCH_ENABLED=true
DEMO_LAUNCH_TOKEN_HASH는 `npm run demo:usb`가 출력한 64자리 해시
DEMO_LAUNCH_EXPIRES_AT=2026-12-31T14:59:59.000Z
DEMO_AI_SOURCE_EMAIL=climbing1126@gmail.com
DEMO_AI_DAILY_LIMIT=120
```

실행: `git push origin main` 뒤 `npx vercel --prod`

예상: 운영 배포 성공

- [ ] **5단계: 브라우저 자동 검사**

USB `index.html`을 윈도우 크롬에 해당하는 화면 크기로 열고 다음을 확인한다.

```text
로컬 시작 파일 열림
배포 주소로 이동
김질문 학생 세션 생성
학생 대시보드 표시
학교, 학년, 반, 번호 표시
인공지능 키가 주소와 응답에 없음
```

- [ ] **6단계: 최종 상태 확인**

실행:

```bash
git status --short --branch
git log -10 --oneline
```

예상: 추적되지 않은 기존 PDF 외 작업 파일이 없고 `main`과 `origin/main`이 같음
