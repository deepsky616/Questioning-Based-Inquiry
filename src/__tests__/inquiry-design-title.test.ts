import { describe, expect, it } from "vitest";

import {
  buildInquiryDesignTitle,
  extractInquiryDesignUnitTitle,
} from "@/lib/inquiry-design-title";

describe("질문수업 탐구설계 제목", () => {
  it("수업 날짜와 학년, 교과를 단원명 앞에 붙인다", () => {
    expect(buildInquiryDesignTitle({
      sessionDate: "2026-07-28",
      grade: "5",
      subject: "도덕",
      unitTitle: "자신과의 관계",
    })).toBe("2026-07-28 5학년 도덕 자신과의 관계");
  });

  it("이미 붙은 제목과 잘못 저장된 세 자리 연도를 제거하고 현재 정보로 다시 만든다", () => {
    expect(buildInquiryDesignTitle({
      sessionDate: "2026-07-28",
      grade: "5학년",
      subject: "도덕",
      unitTitle: "206-07-28 도덕 자신과의 관계",
    })).toBe("2026-07-28 5학년 도덕 자신과의 관계");

    expect(buildInquiryDesignTitle({
      sessionDate: "2026-08-04",
      grade: "5",
      subject: "도덕",
      unitTitle: "2026-07-28 5학년 도덕 자신과의 관계",
    })).toBe("2026-08-04 5학년 도덕 자신과의 관계");
  });

  it("편집 입력에는 표준 제목에서 단원명만 꺼내 제공한다", () => {
    expect(extractInquiryDesignUnitTitle({
      title: "2026-07-28 5학년 도덕 자신과의 관계",
      grade: "5",
      subject: "도덕",
    })).toBe("자신과의 관계");
  });

  it("날짜나 학년이 없으면 기존 제목을 임의로 바꾸지 않는다", () => {
    expect(buildInquiryDesignTitle({
      sessionDate: null,
      grade: "5",
      subject: "도덕",
      unitTitle: "자신과의 관계",
    })).toBe("자신과의 관계");
  });
});
