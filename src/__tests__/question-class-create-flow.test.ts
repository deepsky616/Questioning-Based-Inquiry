import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  postInquiryDesign,
  runInquiryQuestionClassCreation,
  runSavedDesignQuestionClassCreation,
  type PendingQuestionClassDesign,
} from "@/lib/question-class-creation";
import type { SavedInquiryDesign } from "@/app/(teacher)/teacher-curriculum/types";
import ko from "../../messages/ko.json";

const curriculumPage = readFileSync(
  "src/app/(teacher)/teacher-curriculum/page.tsx",
  "utf8",
);
const inquiryStep = readFileSync(
  "src/app/(teacher)/teacher-curriculum/CurriculumInquiryStep.tsx",
  "utf8",
);
const savedDesignsTab = readFileSync(
  "src/app/(teacher)/teacher-curriculum/SavedDesignsTab.tsx",
  "utf8",
);

const savedDesign: SavedInquiryDesign = {
  id: "design-1",
  title: "별의 움직임",
  subject: "과학",
  gradeRange: "5-6",
  grade: "5",
  sessionDate: "2026-07-20",
  area: "지구와 우주",
  inquiryQuestions: [
    { type: "factual", content: "별은 밤하늘에서 어떻게 움직이는가?" },
  ],
};

describe("탐구질문 수업 만들기 요청 흐름", () => {
  it("설계 저장과 수업 생성이 모두 성공한 경우에만 성공 후속 처리를 실행한다", async () => {
    const saveDesign = vi.fn(async () => savedDesign);
    const createSession = vi.fn(async () => ({ id: "session-1", createdAt: "2026-07-13T00:00:00.000Z" }));
    const onSuccess = vi.fn();

    const result = await runInquiryQuestionClassCreation({
      inputSignature: "same-input",
      pendingDesign: null,
      saveDesign,
      createSession,
      onSuccess,
    });

    expect(result).toMatchObject({ status: "success", pendingDesign: null });
    expect(saveDesign).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledWith(savedDesign);
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: "session-1" }),
    );
  });

  it.each([
    ["통신 실패", vi.fn(async () => { throw new Error("network"); })],
    ["식별값 누락", vi.fn(async () => ({ createdAt: "2026-07-13T00:00:00.000Z" }))],
    ["빈 식별값", vi.fn(async () => ({ id: "   " }))],
  ])("%s에서는 성공 후속 처리를 실행하지 않아 현재 입력을 보존한다", async (_name, createSession) => {
    const currentInput = {
      step: 5,
      title: "별의 움직임",
      date: "2026-07-20",
      grade: "5",
      targetClassValue: "class:5:1",
      selectedStudentIds: ["student-1"],
      visibility: {
        isActive: true,
        defaultQuestionPublic: false,
        likesVisibleToPeers: true,
        commentsVisibleToPeers: false,
      },
    };
    const originalInput = structuredClone(currentInput);
    const onSuccess = vi.fn(() => {
      currentInput.step = 1;
      currentInput.title = "";
    });

    const result = await runInquiryQuestionClassCreation({
      inputSignature: "same-input",
      pendingDesign: null,
      saveDesign: vi.fn(async () => savedDesign),
      createSession,
      onSuccess,
    });

    expect(result.status).toBe("session-failed");
    expect(result.pendingDesign).toEqual({
      inputSignature: "same-input",
      design: savedDesign,
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(currentInput).toEqual(originalInput);
  });

  it.each([
    ["통신 실패", vi.fn(async () => { throw new Error("network"); })],
    ["비정상 응답", vi.fn(async () => null)],
  ])("설계 저장 %s에서도 성공 후속 처리를 실행하지 않는다", async (_name, saveDesign) => {
    const onSuccess = vi.fn();
    const result = await runInquiryQuestionClassCreation({
      inputSignature: "same-input",
      pendingDesign: null,
      saveDesign,
      createSession: vi.fn(async () => ({ id: "session-1" })),
      onSuccess,
    });

    expect(result.status).toBe("design-failed");
    expect(result.pendingDesign).toBeNull();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("설계 응답의 두 식별값이 다르면 저장 성공으로 해석하지 않는다", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({ designId: "design-1", design: { ...savedDesign, id: "design-2" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    await expect(
      postInquiryDesign<SavedInquiryDesign>({
        payload: { title: savedDesign.title },
        fallbackError: "저장 실패",
        fetcher,
      }),
    ).rejects.toThrow("저장 실패");
  });

  it("같은 입력 재시도는 저장 설계를 재사용하고 입력이 바뀌면 새 설계를 저장한다", async () => {
    const saveDesign = vi
      .fn<() => Promise<SavedInquiryDesign | null>>()
      .mockResolvedValueOnce(savedDesign)
      .mockResolvedValueOnce({ ...savedDesign, id: "design-2", title: "달의 움직임" });
    const createSession = vi
      .fn<(design: SavedInquiryDesign) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ id: "session-1" })
      .mockResolvedValueOnce({ id: "session-2" });

    const first = await runInquiryQuestionClassCreation({
      inputSignature: "same-input",
      pendingDesign: null,
      saveDesign,
      createSession,
      onSuccess: vi.fn(),
    });
    expect(first.status).toBe("session-failed");

    const second = await runInquiryQuestionClassCreation({
      inputSignature: "same-input",
      pendingDesign: first.pendingDesign,
      saveDesign,
      createSession,
      onSuccess: vi.fn(),
    });
    expect(second.status).toBe("success");
    expect(saveDesign).toHaveBeenCalledTimes(1);

    const changedInputPending: PendingQuestionClassDesign<SavedInquiryDesign> | null = first.pendingDesign;
    const third = await runInquiryQuestionClassCreation({
      inputSignature: "changed-input",
      pendingDesign: changedInputPending,
      saveDesign,
      createSession,
      onSuccess: vi.fn(),
    });
    expect(third.status).toBe("success");
    expect(saveDesign).toHaveBeenCalledTimes(2);
    expect(createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "design-2" }),
    );
  });
});

describe("저장 설계에서 새 수업 만들기", () => {
  it("유효한 수업 식별값이 있을 때만 성공 후속 처리를 실행한다", async () => {
    const refreshDesigns = vi.fn();
    const onSuccess = vi.fn();

    const result = await runSavedDesignQuestionClassCreation({
      updateDesign: vi.fn(async () => true),
      createSession: vi.fn(async () => ({ id: "saved-session-1" })),
      refreshDesigns,
      onSuccess,
    });

    expect(result.status).toBe("success");
    expect(refreshDesigns).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: "saved-session-1" }),
    );
  });

  it.each([
    ["식별값 누락", vi.fn(async () => ({}))],
    ["통신 실패", vi.fn(async () => { throw new Error("network"); })],
  ])("수업 생성 %s에서도 설계 목록은 다시 조회하고 편집 닫기 후속 처리는 실행하지 않는다", async (_name, createSession) => {
    const refreshDesigns = vi.fn();
    const onSuccess = vi.fn();

    const result = await runSavedDesignQuestionClassCreation({
      updateDesign: vi.fn(async () => true),
      createSession,
      refreshDesigns,
      onSuccess,
    });

    expect(result.status).toBe("session-failed");
    expect(refreshDesigns).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe("질문수업 사용자 행동과 관리 연결", () => {
  it("마지막 단계와 저장 설계 행동을 새 수업 만들기 의미로 표시한다", () => {
    expect(inquiryStep).toContain('t("createInquiryQuestionClass")');
    expect(inquiryStep).toContain("BookOpenCheck");
    expect(ko.curriculum.createInquiryQuestionClass).toBe("탐구질문 수업 만들기");
    expect(ko.curriculum.redeployToSession).toBe("이 설계로 새 수업 만들기");
    expect(savedDesignsTab).toContain("createQuestionClassFromDesign");
  });

  it("성공 뒤 질문수업 캐시를 새로 읽고 생성 수업을 강조하는 관리 주소로 이동한다", () => {
    expect(curriculumPage).toContain("appQueryKeys.teacherSessions");
    expect(curriculumPage).toContain("invalidateQueries");
    expect(curriculumPage).toContain("/teacher-sessions?session=");
    expect(savedDesignsTab).toContain("appQueryKeys.teacherSessions");
    expect(savedDesignsTab).toContain("/teacher-sessions?session=");
  });

  it("저장만 하기 성공에서는 남아 있던 수업 생성 재시도 설계를 먼저 지운다", () => {
    const saveOnlyFlow = curriculumPage.slice(
      curriculumPage.indexOf("const handleSave = async"),
      curriculumPage.indexOf("const handleSaveAndCreateSession"),
    );
    expect(saveOnlyFlow).toContain("pendingQuestionClassDesign.current = null");
    expect(saveOnlyFlow.indexOf("pendingQuestionClassDesign.current = null")).toBeLessThan(
      saveOnlyFlow.indexOf("resetSaveForm()"),
    );
  });
});
