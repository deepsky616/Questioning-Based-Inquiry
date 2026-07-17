import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";
import ko from "../../messages/ko.json";
import en from "../../messages/en.json";
import {
  ROOT_CLIENT_NAMESPACES,
  AUTH_CLIENT_NAMESPACES,
  STUDENT_CLIENT_NAMESPACES,
  TEACHER_CLIENT_NAMESPACES,
  pickMessages,
} from "@/i18n/client-namespaces";

/**
 * i18n 클라이언트 페이로드 가드.
 *
 * 루트/인증/학생/교사 레이아웃은 전체 카탈로그(~65KB) 대신 각 영역이
 * 실제로 쓰는 namespace만 클라이언트에 보낸다. 이 테스트는 소스에서
 * import 그래프를 따라 실제 사용 namespace를 다시 계산해, 코드가 새
 * namespace를 쓰기 시작했는데 목록에 빠져 있으면(=런타임 번역 누락)
 * 배포 전에 실패시킨다.
 */

const NS_RE = /(?:useTranslations|getTranslations)\(\s*["']([A-Za-z0-9_.]+)["']/g;
const IMP_RE = /from\s+["'](@\/[^"']+|\.{1,2}\/[^"']+)["']/g;

function resolveImport(fromFile: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? path.join("src", spec.slice(2))
    : path.normalize(path.join(path.dirname(fromFile), spec));
  for (const cand of [
    `${base}.tsx`,
    `${base}.ts`,
    path.join(base, "index.tsx"),
    path.join(base, "index.ts"),
  ]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p));
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function scanNamespaces(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const namespaces = new Set<string>();
  const stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const m of source.matchAll(NS_RE)) {
      namespaces.add(m[1].split(".")[0]);
    }
    for (const m of source.matchAll(IMP_RE)) {
      const resolved = resolveImport(file, m[1]);
      if (resolved) stack.push(resolved);
    }
  }
  return namespaces;
}

function expectCovers(list: readonly string[], used: Set<string>, label: string) {
  const missing = [...used].filter((ns) => !list.includes(ns));
  expect(missing, `${label} 목록에 빠진 namespace`).toEqual([]);
}

describe("i18n client payload guards", () => {
  it("루트 레이아웃 목록은 최상위 화면과 전역 프로바이더가 쓰는 namespace를 모두 담는다", () => {
    const used = scanNamespaces(listFiles("src/app").filter((f) => !f.includes("(")));
    expectCovers(ROOT_CLIENT_NAMESPACES, used, "ROOT");
  });

  it("인증 목록은 (auth) 화면이 쓰는 namespace를 모두 담는다", () => {
    const used = scanNamespaces(listFiles("src/app/(auth)"));
    expectCovers(AUTH_CLIENT_NAMESPACES, used, "AUTH");
  });

  it("학생 목록은 (student) 화면이 쓰는 namespace를 모두 담는다", () => {
    const used = scanNamespaces(listFiles("src/app/(student)"));
    expectCovers(STUDENT_CLIENT_NAMESPACES, used, "STUDENT");
  });

  it("교사 목록은 (teacher) 화면이 쓰는 namespace를 모두 담는다", () => {
    const used = scanNamespaces(listFiles("src/app/(teacher)"));
    expectCovers(TEACHER_CLIENT_NAMESPACES, used, "TEACHER");
  });

  it("목록의 모든 namespace는 ko·en 카탈로그에 실제로 존재한다", () => {
    for (const list of [
      ROOT_CLIENT_NAMESPACES,
      AUTH_CLIENT_NAMESPACES,
      STUDENT_CLIENT_NAMESPACES,
      TEACHER_CLIENT_NAMESPACES,
    ]) {
      for (const ns of list) {
        expect(ko, `ko.json에 없는 namespace: ${ns}`).toHaveProperty(ns);
        expect(en, `en.json에 없는 namespace: ${ns}`).toHaveProperty(ns);
      }
    }
  });

  it("pickMessages는 지정한 namespace만 남긴다", () => {
    const picked = pickMessages(
      { a: { x: "1" }, b: { y: "2" }, c: { z: "3" } },
      ["a", "c"],
    );
    expect(Object.keys(picked).sort()).toEqual(["a", "c"]);
  });

  it("레이아웃들이 전체 카탈로그 대신 pickMessages를 사용한다", () => {
    expect(readFileSync("src/app/layout.tsx", "utf8")).toContain("pickMessages");
    expect(readFileSync("src/app/(auth)/layout.tsx", "utf8")).toContain("pickMessages");
    expect(readFileSync("src/app/(student)/layout.tsx", "utf8")).toContain("pickMessages");
    expect(readFileSync("src/app/(teacher)/layout.tsx", "utf8")).toContain("pickMessages");
  });
});
