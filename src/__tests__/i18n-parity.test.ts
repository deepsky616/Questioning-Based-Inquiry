import { describe, it, expect } from "vitest";
import ko from "../../messages/ko.json";
import en from "../../messages/en.json";

// 중첩 객체를 점 경로 키 집합으로 평탄화(리프만 수집)
function flatKeys(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return prefix ? [prefix] : [];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v !== null && typeof v === "object" ? flatKeys(v, path) : [path];
  });
}

describe("i18n ko/en 키 파리티", () => {
  const koKeys = flatKeys(ko);
  const enKeys = flatKeys(en);
  const koSet = new Set(koKeys);
  const enSet = new Set(enKeys);

  it("ko에만 있고 en에 없는 키가 없어야 한다", () => {
    const missingInEn = koKeys.filter((k) => !enSet.has(k));
    expect(missingInEn, `en.json에 누락: ${missingInEn.join(", ")}`).toEqual([]);
  });

  it("en에만 있고 ko에 없는 키가 없어야 한다", () => {
    const missingInKo = enKeys.filter((k) => !koSet.has(k));
    expect(missingInKo, `ko.json에 누락: ${missingInKo.join(", ")}`).toEqual([]);
  });
});
