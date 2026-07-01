import { describe, it, expect } from "vitest";
import { filterSortSavedDesigns, type SavedDesignLike } from "@/lib/saved-designs";

const list: SavedDesignLike[] = [
  { title: "광합성", subject: "과학", area: "생명", grade: "4", sessionDate: "2026-05-01", createdAt: "2026-04-01" },
  { title: "물의 상태", subject: "과학", area: "물질", grade: "3", sessionDate: "2026-05-10", createdAt: "2026-04-02" },
  { title: "지형", subject: "사회", area: "지리", grade: "4", sessionDate: null, createdAt: "2026-04-03" },
];

describe("filterSortSavedDesigns", () => {
  it("교과로 필터한다", () => {
    const r = filterSortSavedDesigns(list, { subject: "과학" }, "desc");
    expect(r.map((d) => d.title)).toEqual(["물의 상태", "광합성"]);
  });

  it("영역·학년 복합 필터", () => {
    const r = filterSortSavedDesigns(list, { area: "생명", grade: "4" }, "desc");
    expect(r.map((d) => d.title)).toEqual(["광합성"]);
  });

  it("단원(title)로 필터한다", () => {
    const r = filterSortSavedDesigns(list, { unit: "지형" }, "desc");
    expect(r.map((d) => d.title)).toEqual(["지형"]);
  });

  it("최신순(desc): 수업날짜 내림차순, 날짜 없으면 생성일 사용", () => {
    const r = filterSortSavedDesigns(list, {}, "desc");
    // 2026-05-10 > 2026-05-01 > (지형: createdAt 2026-04-03)
    expect(r.map((d) => d.title)).toEqual(["물의 상태", "광합성", "지형"]);
  });

  it("오래된순(asc)", () => {
    const r = filterSortSavedDesigns(list, {}, "asc");
    expect(r.map((d) => d.title)).toEqual(["지형", "광합성", "물의 상태"]);
  });

  it("필터가 비어 있으면 전체를 반환한다", () => {
    expect(filterSortSavedDesigns(list, {}, "desc")).toHaveLength(3);
  });
});
