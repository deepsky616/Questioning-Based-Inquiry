// 저장된 탐구설계 목록의 조회(필터)·정렬 순수 로직(테스트 용이하게 분리)

export interface SavedDesignFilters {
  date?: string;
  grade?: string;
  subject?: string;
  area?: string;
  unit?: string;
}

export interface SavedDesignLike {
  sessionDate?: string | null;
  grade?: string | null;
  subject: string;
  area: string;
  title: string;
  unitTitle?: string;
  createdAt?: string | Date;
}

// 정렬 기준값: 수업날짜 우선, 없으면 생성일(문자열일 때). 없으면 빈 문자열.
function sortKey(d: SavedDesignLike): string {
  return d.sessionDate || (typeof d.createdAt === "string" ? d.createdAt : "");
}

export function filterSortSavedDesigns<T extends SavedDesignLike>(
  list: T[],
  filters: SavedDesignFilters,
  sort: "desc" | "asc",
): T[] {
  return list
    .filter((d) =>
      (!filters.date || d.sessionDate === filters.date) &&
      (!filters.grade || d.grade === filters.grade) &&
      (!filters.subject || d.subject === filters.subject) &&
      (!filters.area || d.area === filters.area) &&
      (!filters.unit || (d.unitTitle ?? d.title) === filters.unit),
    )
    .sort((a, b) => {
      const av = sortKey(a);
      const bv = sortKey(b);
      return sort === "desc" ? bv.localeCompare(av) : av.localeCompare(bv);
    });
}
