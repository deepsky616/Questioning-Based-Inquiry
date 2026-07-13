// 2022 개정 교육과정 문서의 영역 순서를 따른다.
const AREA_ORDER: Record<string, string[]> = {
  국어: ["듣기·말하기", "읽기", "쓰기", "문법", "문학", "매체"],
  수학: ["수와 연산", "변화와 관계", "도형과 측정", "자료와 가능성"],
  사회: ["지리 인식", "자연환경과 인간생활", "인문환경과 인간생활", "지속가능한 세계", "정치", "법", "경제", "사회·문화", "역사 일반", "지역사", "한국사"],
  과학: ["운동과 에너지", "물질", "생명", "지구와 우주", "과학과 사회"],
  도덕: ["자신과의 관계", "타인과의 관계", "사회·공동체와의 관계", "자연과의 관계"],
  음악: ["연주", "감상", "창작"],
  미술: ["미적 체험", "표현", "감상"],
  체육: ["운동", "스포츠", "표현"],
  영어: ["이해(reception)", "표현(production)"],
  실과: ["인간 발달과 주도적 삶", "생활환경과 지속가능한 선택", "기술적 문제해결과 혁신", "지속가능한 기술과 융합", "디지털 사회와 인공지능"],
  "바른 생활": ["나와 우리", "자연과 더불어 사는 삶", "인터넷·AI와 생활"],
  "슬기로운 생활": ["나와 가족", "마을과 우리나라", "봄·여름", "가을·겨울"],
  "즐거운 생활": ["나와 가족", "마을과 우리나라", "봄·여름", "가을·겨울"],
};

export function sortCurriculumAreas(
  areas: { id: string; area: string }[],
  subject: string,
) {
  const order = AREA_ORDER[subject] ?? [];
  return [...areas].sort((a, b) => {
    const left = order.indexOf(a.area);
    const right = order.indexOf(b.area);
    if (left === -1 && right === -1) return a.area.localeCompare(b.area, "ko");
    if (left === -1) return 1;
    if (right === -1) return -1;
    return left - right;
  });
}
