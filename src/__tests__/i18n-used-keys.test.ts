import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ko from "../../messages/ko.json";
import en from "../../messages/en.json";

/**
 * 번역 카탈로그 무결성 가드.
 *
 * 1) 코드가 정적으로 참조하는 모든 번역 키가 ko·en 카탈로그에 실재해야 한다
 *    — 누락되면 화면에 원시 키(curriculum.deleteConfirm 등)가 그대로 노출된다.
 * 2) ko와 en의 키 집합이 완전히 같아야 한다(한쪽만 추가하는 실수 방지).
 * 3) en 카탈로그 값에 한글이 남아 있으면 미번역이다.
 */

function flatten(obj: Record<string, unknown>, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      for (const [ck, cv] of flatten(v as Record<string, unknown>, key)) out.set(ck, cv);
    } else {
      out.set(key, v);
    }
  }
  return out;
}

const koFlat = flatten(ko as Record<string, unknown>);
const enFlat = flatten(en as Record<string, unknown>);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (entry === "__tests__" || entry === "node_modules") continue;
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(tsx|ts)$/.test(entry)) out.push(p);
  }
  return out;
}

// const t = useTranslations("ns") / const t = await getTranslations("ns" | {namespace:"ns"})
const DECL = /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*["']([A-Za-z0-9_.]+)["']\s*\)/g;
const DECL_OBJ = /(?:const|let)\s+(\w+)\s*=\s*await\s+getTranslations\(\s*\{[^}]*namespace:\s*["']([A-Za-z0-9_.]+)["']/g;

function collectUsedKeys(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  for (const file of sourceFiles("src")) {
    const src = readFileSync(file, "utf8");
    const decls = new Map<string, string>();
    for (const m of src.matchAll(DECL)) decls.set(m[1], m[2]);
    for (const m of src.matchAll(DECL_OBJ)) decls.set(m[1], m[2]);
    for (const [variable, ns] of decls) {
      const call = new RegExp(
        `\\b${variable}(?:\\.(?:rich|raw|markup|has))?\\(\\s*(["'\`])([^"'\`]+)\\1`,
        "g",
      );
      for (const m of src.matchAll(call)) {
        const key = m[2];
        if (key.includes("${")) continue; // 동적 키는 정적 검증 대상 아님
        const full = `${ns}.${key}`;
        if (!used.has(full)) used.set(full, []);
        used.get(full)!.push(file);
      }
    }
  }
  return used;
}

describe("i18n catalog guards", () => {
  it("코드가 쓰는 모든 번역 키가 ko와 en에 실재한다", () => {
    const used = collectUsedKeys();
    expect(used.size).toBeGreaterThan(1000); // 스캐너 자체 고장 감지
    const missing: string[] = [];
    for (const [key, files] of used) {
      if (!koFlat.has(key) || !enFlat.has(key)) {
        missing.push(`${key} (${files[0]})`);
      }
    }
    expect(missing, "카탈로그에 없는 사용 키").toEqual([]);
  });

  it("ko와 en의 키 집합이 완전히 같다", () => {
    const onlyKo = [...koFlat.keys()].filter((k) => !enFlat.has(k));
    const onlyEn = [...enFlat.keys()].filter((k) => !koFlat.has(k));
    expect(onlyKo, "en에 없는 ko 키").toEqual([]);
    expect(onlyEn, "ko에 없는 en 키").toEqual([]);
  });

  it("en 카탈로그 값에 한글이 없다", () => {
    const hangul = /[가-힣]/;
    const untranslated = [...enFlat.entries()]
      .filter(([, v]) => typeof v === "string" && hangul.test(v))
      .map(([k]) => k);
    expect(untranslated, "en에 미번역(한글) 값").toEqual([]);
  });
});
