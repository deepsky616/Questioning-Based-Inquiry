import { describe, expect, it } from "vitest";
import { readCurriculumDraft, writeCurriculumDraft, clearCurriculumDraft } from "@/lib/curriculum-draft";
const storage = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } }; };
describe("교사 수업 초안 복구", () => {
  it("작성 단계와 선택을 복구하고 다른 교사에게 노출하지 않는다", () => {
    const store = storage();
    writeCurriculumDraft(store, "t1", { step: 3, selGrade: "5-6", selSubject: "과학", selectedKeywords: ["용해"], coreSentences: ["물에 녹는 양은 조건에 따라 달라져요."] }, 1000);
    expect(readCurriculumDraft(store, "t1", 2000)?.value).toMatchObject({ step: 3, selGrade: "5-6", selectedKeywords: ["용해"] });
    expect(readCurriculumDraft(store, "t2", 2000)).toBeNull();
    clearCurriculumDraft(store, "t1");
    expect(readCurriculumDraft(store, "t1", 2000)).toBeNull();
  });
  it("오래된 초안이나 잘못된 저장 내용으로 작성 화면을 복구하지 않는다", () => {
    const store = storage();
    writeCurriculumDraft(store, "t1", { step: 2, selGrade: "5-6" }, 1000);
    expect(readCurriculumDraft(store, "t1", 1000 + 8 * 86400000)).toBeNull();
    expect(() => writeCurriculumDraft(store, "t1", { step: 99 }, 1000)).toThrow();
    expect(() => writeCurriculumDraft(store, "", { step: 1 }, 1000)).toThrow();
  });
});
