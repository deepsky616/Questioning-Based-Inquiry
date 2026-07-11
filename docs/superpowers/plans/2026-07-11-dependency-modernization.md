# 의존성 최신화 구현 계획

> **작업 에이전트 필수:** 이 계획은 `superpowers:subagent-driven-development` 또는 `superpowers:executing-plans`를 사용해 작업별로 실행한다. 진행 상태는 체크 상자로 기록한다.

**목표:** 데이터베이스를 바꾸지 않고 Next.js 실행 기반과 구글 생성형 인공지능 도구를 지원 중인 버전으로 옮기며 기존 인증, 화면, API, 모델 대체 동작을 보존한다.

**구조:** 첫 커밋은 Next.js 16, React 19, ESLint 9, 인증 프록시, 비동기 요청 값을 하나의 실행 가능한 변경으로 묶는다. 둘째 커밋은 공통 인공지능 계층과 번역 스크립트만 새 구글 도구로 옮긴다. 각 커밋은 전체 검사와 빌드를 독립적으로 통과해야 하며 둘째 커밋만 따로 되돌릴 수 있어야 한다.

**기술:** Next.js 16.2.10, React 19.2.7, NextAuth 5.0.0-beta.31, next-intl 4.13.2, ESLint 9.39.4, Vitest, Playwright, `@google/genai` 2.11.0, Prisma, Vercel

## 공통 제약

- Node.js는 `20.9.0` 이상을 요구하고 로컬과 지속 통합에서는 Node.js 24를 사용한다.
- `next`, `react`, `react-dom`, `next-auth`, `next-intl`, `eslint`, `eslint-config-next`, React 형식 패키지는 설계 문서의 정확한 버전으로 고정한다.
- 강제 설치 옵션인 `--force`와 `--legacy-peer-deps`는 사용하지 않는다.
- 데이터베이스 구조, 권한, 행은 변경하지 않는다.
- 로그인 주소, 쿠키 이름, 세션 값, 역할별 보호 경로는 변경하지 않는다.
- 화면 재설계와 새 기능은 포함하지 않는다.
- 각 구현 단계는 실패 시험을 먼저 확인한 다음 최소 변경으로 통과시킨다.

---

### 작업 1: Next.js 16 실행 기반 갱신

**파일:**

- 생성: `eslint.config.mjs`
- 생성: `src/__tests__/framework-upgrade-guards.test.ts`
- 수정: `package.json`
- 수정: `package-lock.json`
- 수정: `next.config.js`
- 수정: `src/i18n/request.ts`
- 이동과 수정: `src/middleware.ts`에서 `src/proxy.ts`
- 수정: `src/__tests__/auth-edge-boundary.test.ts`
- 수정: `src/app/(student)/student-question-play/[gameId]/page.tsx`
- 수정: `src/app/(teacher)/teacher-question-play/[gameId]/preview/page.tsx`
- 수정: `src/app/api/question-games/rooms/[code]/route.ts`
- 수정: `src/app/api/questions/[id]/route.ts`
- 수정: `src/app/api/questions/[id]/ai-answer/route.ts`
- 수정: `src/app/api/questions/[id]/comments/route.ts`
- 수정: `src/app/api/questions/[id]/comments/[commentId]/route.ts`
- 수정: `src/app/api/sessions/[id]/analysis/route.ts`
- 수정: `src/app/api/sessions/[id]/design-context/route.ts`
- 수정: `src/app/api/sessions/[id]/publish-questions/route.ts`
- 수정: `src/app/api/teacher/question-games/[id]/route.ts`
- 수정: `src/app/api/teacher/students/[id]/stats/route.ts`
- 수정: `src/app/api/unit-design/[id]/route.ts`
- 수정: `src/__tests__/comments-route.test.ts`
- 수정: `src/__tests__/design-context-route.test.ts`
- 수정: `src/__tests__/publish-sequence.test.ts`
- 수정: `src/__tests__/question-edit-guard-route.test.ts`
- 수정: `src/__tests__/session-analysis-route.test.ts`
- 수정: `src/__tests__/unit-design.test.ts`
- 삭제: `.eslintrc.json`
- 삭제: `src/middleware.ts`

**연결 계약:**

- 입력: 기존 `auth-edge`, `route-access`, NextAuth 세션, 동적 경로 인자
- 출력: `src/proxy.ts`의 같은 경로 보호 동작, 모든 동적 경로의 `Promise` 기반 `params`, 비동기 쿠키와 머리글 읽기

- [ ] **단계 1: 실행 기반 실패 시험 추가**

`src/__tests__/framework-upgrade-guards.test.ts`를 다음 계약으로 만든다.

```ts
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const nextConfig = readFileSync("next.config.js", "utf8");

describe("Next.js 16 실행 기반", () => {
  it("지원 버전과 Node.js 하한을 정확히 고정한다", () => {
    expect(packageJson.engines.node).toBe(">=20.9.0");
    expect(packageJson.dependencies).toMatchObject({
      next: "16.2.10",
      react: "19.2.7",
      "react-dom": "19.2.7",
      "next-auth": "5.0.0-beta.31",
      "next-intl": "4.13.2",
    });
    expect(packageJson.devDependencies).toMatchObject({
      eslint: "9.39.4",
      "eslint-config-next": "16.2.10",
      "@types/react": "19.2.17",
      "@types/react-dom": "19.2.3",
    });
  });

  it("평면 ESLint 설정과 안정된 Next.js 설정을 사용한다", () => {
    expect(packageJson.scripts.lint).toBe("eslint .");
    expect(existsSync("eslint.config.mjs")).toBe(true);
    expect(existsSync(".eslintrc.json")).toBe(false);
    expect(nextConfig).toContain('serverExternalPackages: ["nodemailer"]');
    expect(nextConfig).not.toContain("serverComponentsExternalPackages");
  });

  it("middleware 대신 proxy 규약을 사용한다", () => {
    expect(existsSync("src/proxy.ts")).toBe(true);
    expect(existsSync("src/middleware.ts")).toBe(false);
  });
});
```

- [ ] **단계 2: 실행 기반 시험이 실패하는지 확인**

실행:

```bash
npx vitest run src/__tests__/framework-upgrade-guards.test.ts
```

예상: 현재 버전, `engines`, 평면 설정, `proxy.ts` 조건이 맞지 않아 실패한다.

- [ ] **단계 3: 의존성과 Node.js 실행 조건 갱신**

실행:

```bash
npm install --save-exact next@16.2.10 react@19.2.7 react-dom@19.2.7 next-auth@5.0.0-beta.31 next-intl@4.13.2
npm install --save-dev --save-exact eslint@9.39.4 eslint-config-next@16.2.10 @types/react@19.2.17 @types/react-dom@19.2.3
```

`package.json`에 다음 실행 조건을 추가하고 `lint` 명령을 바꾼다.

```json
{
  "engines": {
    "node": ">=20.9.0"
  },
  "scripts": {
    "lint": "eslint ."
  }
}
```

설치가 동료 의존성 오류 없이 끝나고 `package-lock.json`이 새 버전을 고정해야 한다.

- [ ] **단계 4: ESLint와 Next.js 설정 전환**

`.eslintrc.json`을 삭제하고 `eslint.config.mjs`를 다음 내용으로 만든다.

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);
```

`next.config.js`의 실험 설정을 제거하고 다음 최상위 설정을 사용한다.

```js
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["nodemailer"],
  async headers() {
    // 기존 보안 머리글 배열을 그대로 반환한다.
  },
};
```

- [ ] **단계 5: 인증 미들웨어를 프록시 규약으로 이동**

`src/proxy.ts`는 기존 판정 순서와 `matcher`를 그대로 보존한다.

```ts
import { auth } from "@/lib/auth-edge";
import { NextResponse } from "next/server";
import { isPublicRoute, canAccess, getRedirectPath } from "@/lib/route-access";
import type { UserRole } from "@/types/user";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (isPublicRoute(pathname)) return NextResponse.next();

  const role = req.auth?.user?.role as UserRole | undefined;
  if (!canAccess(role ?? null, pathname)) {
    const redirectTo = role ? getRedirectPath(role) : "/login";
    return NextResponse.redirect(new URL(redirectTo, req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

`src/__tests__/auth-edge-boundary.test.ts`는 `src/proxy.ts`를 읽고 공통 인증 모듈에 `bcrypt`, 데이터베이스, 자격 증명 공급자가 섞이지 않는 기존 계약을 계속 검사한다.

- [ ] **단계 6: 동적 경로 인자를 비동기로 전환**

API 경로마다 문맥 형식을 `Promise`로 바꾸고 사용 전에 한 번만 푼다. 식별자가 `id`인 경로의 공통 모양은 다음과 같다.

```ts
type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  // 기존 본문은 params.id 대신 id를 사용한다.
}
```

`code` 경로는 다음 모양을 사용한다.

```ts
type Params = { params: Promise<{ code: string }> };

export async function GET(req: Request, { params }: Params) {
  const { code } = await params;
  // 기존 본문은 params.code 대신 code를 사용한다.
}
```

댓글 경로는 두 값을 함께 푼다.

```ts
type Params = { params: Promise<{ id: string; commentId: string }> };
const { id, commentId } = await params;
```

한 파일에 여러 HTTP 함수가 있으면 각 함수가 받은 `params`를 자신의 첫 사용 전에 푼다. 대상은 파일 목록에 적힌 열한 API 경로이며, 이미 `Promise` 형식을 쓰는 좋아요, 알림, 세션 참여, 알림 전송, 세션 단건, 단원 설계 세션 경로는 바꾸지 않는다.

- [ ] **단계 7: 클라이언트 페이지와 국제화 요청 값을 비동기로 전환**

두 게임 페이지는 React 19의 `use`로 경로 값을 푼다.

```tsx
import { use, useEffect } from "react";

export default function GamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  // 기존 화면 로직을 유지한다.
}
```

교사 미리 보기 페이지에도 같은 형식을 적용한다. `src/i18n/request.ts`는 쿠키와 머리글을 함께 기다린다.

```ts
export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(
    cookieStore.get("NEXT_LOCALE")?.value,
    headerStore.get("accept-language"),
  );
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
```

- [ ] **단계 8: 직접 호출 시험의 경로 문맥 갱신**

여섯 시험 파일에서 동기 문맥을 다음처럼 바꾼다.

```ts
const ctx = { params: Promise.resolve({ id: "s1" }) };

await getComments(request, {
  params: Promise.resolve({ id: "q1" }),
});

await patchComment(request, {
  params: Promise.resolve({ id: "q1", commentId: "c1" }),
});
```

시험의 요청 본문, 예상 상태 코드, 데이터베이스 모의 값은 바꾸지 않는다.

- [ ] **단계 9: 실행 기반 검증**

실행:

```bash
npx vitest run src/__tests__/framework-upgrade-guards.test.ts src/__tests__/auth-edge-boundary.test.ts src/__tests__/route-access.test.ts src/__tests__/comments-route.test.ts src/__tests__/design-context-route.test.ts src/__tests__/publish-sequence.test.ts src/__tests__/question-edit-guard-route.test.ts src/__tests__/session-analysis-route.test.ts src/__tests__/unit-design.test.ts src/__tests__/components.render.test.tsx
npm run lint
npx tsc --noEmit
npm test
npm run build
npm audit --omit=dev
```

예상: 모든 시험, 검사, 빌드가 성공한다. 빌드에는 `middleware`, 동기 요청 값, 실험 설정 폐기 경고가 없어야 하며 Next.js 14에서 비롯된 운영 취약점이 사라져야 한다.

- [ ] **단계 10: 실행 기반 커밋**

```bash
git add package.json package-lock.json next.config.js eslint.config.mjs src/proxy.ts src/i18n/request.ts src/app src/__tests__ .eslintrc.json src/middleware.ts
git commit -m "chore: upgrade to Next.js 16"
```

---

### 작업 2: 구글 생성형 인공지능 도구 교체

**파일:**

- 생성: `src/__tests__/ai-errors.test.ts`
- 생성: `src/__tests__/genai-sdk-migration.test.ts`
- 수정: `package.json`
- 수정: `package-lock.json`
- 수정: `src/lib/ai.ts`
- 수정: `src/lib/ai-errors.ts`
- 수정: `scripts/translate-messages.mjs`
- 수정: `src/__tests__/ai-service.test.ts`
- 수정: `src/__tests__/ai-failover.test.ts`
- 수정: `src/__tests__/unit-design.test.ts`
- 수정: `src/__tests__/session-analysis-route.test.ts`
- 수정: `src/__tests__/ai-service-unification.test.ts`
- 수정: `src/__tests__/classify-route-ai-service.test.ts`

**연결 계약:**

- 입력: `GenerateOptions`, 교사별 API 키와 모델, 지시문, 온도, 요청 언어
- 출력: 기존 `generateText`, `generateJson`, `generateJsonArray`, `generateJsonWithMetadata` 형식과 같은 모델 대체 순서

- [ ] **단계 1: 새 오류와 도구 경계 실패 시험 추가**

`src/__tests__/ai-errors.test.ts`에 숫자 상태만 있는 새 도구 오류 계약을 추가한다.

```ts
import { describe, expect, it } from "vitest";
import { isTransientAiError } from "@/lib/ai-errors";

describe("구글 인공지능 일시 오류 판정", () => {
  it.each([429, 503])("status %s를 재시도 대상으로 판정한다", (status) => {
    const error = Object.assign(new Error("request failed"), { status });
    expect(isTransientAiError(error)).toBe(true);
  });

  it("다른 숫자 상태는 재시도 대상으로 판정하지 않는다", () => {
    const error = Object.assign(new Error("request failed"), { status: 400 });
    expect(isTransientAiError(error)).toBe(false);
  });
});
```

`src/__tests__/genai-sdk-migration.test.ts`는 운영 사용처만 검사한다.

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const aiSource = readFileSync("src/lib/ai.ts", "utf8");
const translateSource = readFileSync("scripts/translate-messages.mjs", "utf8");
const oldPackage = ["@google", "generative-ai"].join("/");

describe("구글 생성형 인공지능 도구 경계", () => {
  it("새 도구만 운영 의존성으로 사용한다", () => {
    expect(packageJson.dependencies["@google/genai"]).toBe("2.11.0");
    expect(packageJson.dependencies[oldPackage]).toBeUndefined();
  });

  it("공통 계층과 번역 스크립트가 새 도구를 사용한다", () => {
    expect(aiSource).toContain('from "@google/genai"');
    expect(translateSource).toContain('from "@google/genai"');
    expect(aiSource).not.toContain(oldPackage);
    expect(translateSource).not.toContain(oldPackage);
  });
});
```

- [ ] **단계 2: 새 시험이 실패하는지 확인**

실행:

```bash
npx vitest run src/__tests__/ai-errors.test.ts src/__tests__/genai-sdk-migration.test.ts
```

예상: 숫자 상태 판정과 새 패키지 경계 조건이 현재 구현에서 실패한다.

- [ ] **단계 3: 숫자 상태 기반 일시 오류 판정 구현**

`src/lib/ai-errors.ts`의 판정 함수는 새 도구의 `status`와 기존 메시지 판정을 모두 지원한다.

```ts
export function isTransientAiError(err: unknown): boolean {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? (err as { status?: unknown }).status
      : undefined;
  if (status === 429 || status === 503) return true;

  const msg = err instanceof Error ? err.message : String(err);
  return /\b(503|429)\b|Service Unavailable|high demand|overloaded|Resource has been exhausted|Too Many Requests/i.test(msg);
}
```

실행:

```bash
npx vitest run src/__tests__/ai-errors.test.ts
```

예상: 세 시험이 모두 통과한다.

- [ ] **단계 4: 새 도구 설치와 호출 계약 시험 전환**

먼저 새 도구를 이전 도구와 함께 설치한다.

```bash
npm install --save-exact @google/genai@2.11.0
```

네 시험 파일의 모의 객체를 다음 공통 모양으로 바꾼다.

```ts
const generateContent = vi.hoisted(() => vi.fn());
const constructorCall = vi.hoisted(() => vi.fn());

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
    constructor(options: { apiKey: string }) {
      constructorCall(options);
    }
  },
}));

const reply = (text: string) => ({ text });
```

`src/__tests__/ai-service.test.ts`는 생성자와 요청 형식을 검사한다.

```ts
expect(constructorCall).toHaveBeenCalledWith({ apiKey: "k" });
expect(generateContent).toHaveBeenCalledWith({
  model: "gemini-2.5-flash",
  contents: "ASK",
  config: { temperature: 0.1 },
});
```

지시문 시험도 추가한다.

```ts
await generateText({
  userId: "u",
  prompt: "ASK",
  systemInstruction: "SYSTEM",
  temperature: 0.4,
});

expect(generateContent).toHaveBeenCalledWith({
  model: "gemini-2.5-flash-lite",
  contents: "ASK",
  config: { systemInstruction: "SYSTEM", temperature: 0.4 },
});
```

`src/__tests__/ai-failover.test.ts`는 각 호출 인자의 `model`을 읽어 다음 순서를 검사한다.

```ts
const calledModels = () => generateContent.mock.calls.map(([request]) => request.model);

expect(calledModels()).toEqual([
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
]);
```

`unit-design.test.ts`와 `session-analysis-route.test.ts`는 응답을 `{ text }`로 만들고 전송 지시문을 `generateContent.mock.calls[0][0].contents`에서 읽는다.

- [ ] **단계 5: 새 호출 계약 시험이 실패하는지 확인**

실행:

```bash
npx vitest run src/__tests__/ai-service.test.ts src/__tests__/ai-failover.test.ts src/__tests__/unit-design.test.ts src/__tests__/session-analysis-route.test.ts src/__tests__/genai-sdk-migration.test.ts
```

예상: 공통 계층과 번역 스크립트가 아직 이전 도구를 사용하므로 새 호출 계약과 경계 시험이 실패한다.

- [ ] **단계 6: 공통 인공지능 계층을 새 도구로 전환**

`src/lib/ai.ts`는 `GoogleGenAI`를 만들고 같은 재시도 함수 안에서 다음 요청을 보낸다.

```ts
import { GoogleGenAI } from "@google/genai";

const genAI = new GoogleGenAI({ apiKey: cfg.apiKey });
const runWith = async (modelName: GeminiModel, attempts: number): Promise<GenerateTextResult> => {
  for (let attempt = 1; ; attempt++) {
    try {
      const config = {
        ...(systemInstruction ? { systemInstruction } : {}),
        ...(temp != null ? { temperature: temp } : {}),
      };
      const response = await genAI.models.generateContent({
        model: modelName,
        contents: fullPrompt,
        ...(Object.keys(config).length > 0 ? { config } : {}),
      });
      return { text: (response.text ?? "").trim(), model: modelName };
    } catch (err) {
      if (!isTransientAiError(err)) throw err;
      if (attempt >= attempts) throw new AiBusyError();
      await sleep(800 * attempt);
    }
  }
};
```

주 모델 두 번 뒤 대체 모델 두 번이라는 기존 순서를 유지한다.

- [ ] **단계 7: 번역 스크립트와 직접 사용 방지 시험 전환**

`scripts/translate-messages.mjs`는 다음 호출을 사용한다.

```js
import { GoogleGenAI } from "@google/genai";

const genAI = new GoogleGenAI({ apiKey });
const res = await genAI.models.generateContent({
  model: "gemini-2.0-flash",
  contents: prompt,
});
const text = res.text ?? "";
```

`ai-service-unification.test.ts`와 `classify-route-ai-service.test.ts`의 직접 사용 금지 식에 `@google/genai`와 `GoogleGenAI`를 추가한다. `src/lib/ai.ts`만 새 도구를 직접 가져올 수 있으며 번역 스크립트는 운영 경로 밖의 명시된 예외다.

- [ ] **단계 8: 이전 도구 제거와 관련 시험 통과 확인**

실행:

```bash
npm uninstall @google/generative-ai
npx vitest run src/__tests__/ai-errors.test.ts src/__tests__/genai-sdk-migration.test.ts src/__tests__/ai-service.test.ts src/__tests__/ai-failover.test.ts src/__tests__/unit-design.test.ts src/__tests__/session-analysis-route.test.ts src/__tests__/ai-service-unification.test.ts src/__tests__/classify-route-ai-service.test.ts
```

예상: 모든 관련 시험이 통과하고 운영 사용처에 이전 패키지 참조가 없다.

- [ ] **단계 9: 구글 도구 단계 전체 검증**

실행:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
npm audit --omit=dev
```

예상: 모든 검사와 빌드가 성공하고, 인공지능 정상 응답, 재시도, 대체 모델, 비일시 오류 전달 계약이 유지된다.

- [ ] **단계 10: 구글 도구 교체 커밋**

```bash
git add package.json package-lock.json src/lib/ai.ts src/lib/ai-errors.ts scripts/translate-messages.mjs src/__tests__
git commit -m "chore: migrate to Google GenAI SDK"
```

---

### 작업 3: 통합 검증, 미리 보기, 푸시

**파일:**

- 검증: `.github/workflows/ci.yml`
- 검증: `playwright.config.ts`
- 검증: `vercel.json`
- 검증: 전체 작업 트리와 커밋 기록

**연결 계약:**

- 입력: 작업 1과 작업 2의 독립 커밋
- 출력: 재현 가능한 잠금 설치, 통과한 운영 빌드, 확인된 인증 경계, 원격 `main`과 성공한 배포

- [ ] **단계 1: 잠금 파일 재현성과 전체 정적 검사 확인**

실행:

```bash
npm ci
npx prisma generate
npm run lint
npx tsc --noEmit
npm test -- --coverage
npm run build
npm audit --omit=dev
```

예상: 깨끗한 잠금 설치 뒤 모든 검사, 덮임 기준, 데이터베이스 구조와 보안 확인, Next.js 운영 빌드가 성공한다.

- [ ] **단계 2: 개발 서버 브라우저 흐름 확인**

실행:

```bash
npx playwright test e2e/route-protection.spec.ts e2e/auth.spec.ts --project=chromium
```

예상: 홈과 로그인 화면이 표시되고, 로그인하지 않은 보호 페이지는 `/login`으로 이동하며 `/api/questions`는 `401`을 반환한다.

- [ ] **단계 3: 운영 빌드 HTTP 경계 확인**

`PORT=3100 npm start`로 운영 빌드를 실행한 뒤 다음 값을 확인한다.

```bash
curl -I http://127.0.0.1:3100/
curl -I http://127.0.0.1:3100/login
curl -i http://127.0.0.1:3100/api/questions
```

예상: 홈과 로그인은 `200`, 비인증 질문 API는 `401`이다. 확인이 끝나면 서버를 정상 종료한다.

- [ ] **단계 4: 데이터베이스 무변경과 작업 트리 확인**

실행:

```bash
git diff HEAD~2 -- prisma supabase-schema.sql scripts/apply-db-security.mjs
git status --short
git log -4 --oneline
```

예상: 데이터베이스 구조와 보안 적용 파일에는 변경이 없고, 실행 기반과 구글 도구가 서로 다른 커밋으로 보이며 작업 트리가 깨끗하다.

- [ ] **단계 5: Vercel 미리 보기 검증**

실행:

```bash
npx vercel
```

생성된 미리 보기 주소에서 `/`, `/login`, `/api/questions`를 확인한다. 앞의 두 경로는 `200`, 마지막 경로는 `401`이어야 한다. 미리 보기 배포에서는 자료 쓰기 흐름을 실행하지 않는다.

- [ ] **단계 6: 원격 저장소 푸시와 지속 통합 확인**

실행:

```bash
git push origin main
```

원격 `main`이 로컬 마지막 커밋을 가리키는지 확인하고 GitHub 지속 통합의 형식 검사, ESLint, 단위 시험이 모두 성공할 때까지 상태를 확인한다.

- [ ] **단계 7: 운영 배포 확인**

자동 Vercel 배포가 완료되면 운영 주소의 `/`, `/login`, `/api/questions`를 다시 확인한다. 자동 배포가 시작되지 않은 경우에만 다음 명령으로 같은 커밋을 배포한다.

```bash
npx vercel --prod
```

예상: 운영 홈과 로그인은 `200`, 비인증 질문 API는 `401`이며 배포 기록의 커밋이 원격 `main`과 같다.
