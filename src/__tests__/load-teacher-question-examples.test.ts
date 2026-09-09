import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ prisma: { teacherClass: { findMany: mocks.findMany } } }));
import { loadTeacherQuestionExamples } from "@/lib/load-teacher-question-examples";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "teacher-own", role: "TEACHER" } });
  mocks.findMany.mockResolvedValue([{ grade: "5" }, { grade: "5" }]);
});

it("로그인한 교사의 담당 학년만 읽고 학급 중복으로 예시를 반복하지 않는다", async () => {
  const result = await loadTeacherQuestionExamples();
  expect(mocks.findMany).toHaveBeenCalledWith({ where: { teacherId: "teacher-own" }, select: { grade: true } });
  expect(result.grades).toEqual(["5"]);
  expect(result.topics).toHaveLength(2);
});

it.each([null, { user: { id: "student", role: "STUDENT" } }])("교사 인증이 없으면 담당 학급을 조회하지 않는다", async session => {
  mocks.auth.mockResolvedValue(session);
  expect((await loadTeacherQuestionExamples()).topics).toEqual([]);
  expect(mocks.findMany).not.toHaveBeenCalled();
});

it("조회 실패를 일반 학습 화면에서 처리할 수 있는 상태로 돌려준다", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.findMany.mockRejectedValue(new Error("시험용 내부 오류"));
  try {
    expect(await loadTeacherQuestionExamples()).toEqual({ status: "unavailable", grades: [], topics: [] });
    expect(log).toHaveBeenCalledWith("담당 학년의 질문 수업 예시를 불러오지 못했습니다.");
  } finally { log.mockRestore(); }
});
