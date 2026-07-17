import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/ai", () => ({
  AiKeyMissingError: class AiKeyMissingError extends Error {},
  generateText: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    question: { findUnique: vi.fn() },
    questionLike: { create: vi.fn(), delete: vi.fn(), count: vi.fn() },
    pointLog: { count: vi.fn() },
    comment: { count: vi.fn() },
  },
}));

import { GET as getQuestion } from "@/app/api/questions/[id]/route";
import { DELETE as deleteLike, POST as createLike } from "@/app/api/questions/[id]/likes/route";
import { POST as createAiAnswer } from "@/app/api/questions/[id]/ai-answer/route";
import { auth } from "@/lib/auth";
import { generateText } from "@/lib/ai";
import { prisma } from "@/lib/db";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockUserFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockQuestionFind = prisma.question.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockLikeCreate = prisma.questionLike.create as unknown as ReturnType<typeof vi.fn>;
const mockLikeDelete = prisma.questionLike.delete as unknown as ReturnType<typeof vi.fn>;
const mockLikeCount = prisma.questionLike.count as unknown as ReturnType<typeof vi.fn>;
const mockGenerateText = generateText as unknown as ReturnType<typeof vi.fn>;

const teacher = {
  id: "teacher-1",
  role: "TEACHER",
  school: "한빛초",
  grade: null,
  className: null,
  teacherClasses: [{ grade: "5", className: "1" }],
};

const student = {
  id: "student-1",
  role: "STUDENT",
  school: "한빛초",
  grade: "5",
  className: "1",
  teacherClasses: [],
};

const assignedQuestion = {
  id: "question-assigned",
  content: "담당 학급의 공개 질문",
  context: null,
  closure: "open",
  cognitive: "conceptual",
  authorId: "student-assigned",
  isPublic: true,
  session: {
    isActive: true,
    commentsVisibleToPeers: true,
    teacherId: "teacher-1",
    targetType: "CLASS",
    targetGrade: "5",
    targetClassName: "1",
    targetStudentId: null,
    targetStudentIds: [],
    teacher: {
      role: "TEACHER",
      school: "한빛초",
      teacherClasses: [{ grade: "5", className: "1" }],
    },
  },
  comments: [],
  author: {
    id: "student-assigned",
    name: "담당 학생",
    role: "STUDENT",
    school: "한빛초",
    grade: "5",
    className: "1",
  },
};

const unassignedQuestion = {
  ...assignedQuestion,
  id: "question-unassigned",
  content: "같은 학급의 개인 대상 질문수업 질문",
  session: {
    ...assignedQuestion.session,
    targetType: "STUDENT",
    targetGrade: null,
    targetClassName: null,
    targetStudentId: "student-other",
    targetStudentIds: ["student-other"],
  },
};

const selfUnassignedQuestion = {
  ...unassignedQuestion,
  id: "question-self-unassigned",
  content: "대상에서 제외된 뒤 남은 내 질문",
  authorId: student.id,
  author: {
    id: student.id,
    name: "학생",
    role: "STUDENT",
    school: student.school,
    grade: student.grade,
    className: student.className,
  },
};

const outsideQuestion = {
  ...assignedQuestion,
  id: "question-outside",
  content: "담당 밖 공개 질문",
  authorId: "student-outside",
  author: {
    id: "student-outside",
    name: "담당 밖 학생",
    role: "STUDENT",
    school: "새봄초",
    grade: "6",
    className: "2",
  },
};

const request = (path: string, method = "GET") =>
  new Request(`http://localhost${path}`, { method });

const params = (id: string) => ({ params: Promise.resolve({ id }) });

let selectedQuestion: typeof assignedQuestion | typeof unassignedQuestion | typeof selfUnassignedQuestion | typeof outsideQuestion = assignedQuestion;
let selectedViewer: typeof teacher | typeof student = teacher;

beforeEach(() => {
  vi.clearAllMocks();
  selectedQuestion = assignedQuestion;
  selectedViewer = teacher;
  mockAuth.mockResolvedValue({ user: teacher });
  mockUserFind.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === selectedViewer.id ? selectedViewer : null,
  );
  mockQuestionFind.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === selectedQuestion.id ? selectedQuestion : null,
  );
  mockLikeCreate.mockResolvedValue({ id: "like-1" });
  mockLikeDelete.mockResolvedValue({ id: "like-1" });
  mockLikeCount.mockResolvedValue(1);
  mockGenerateText.mockResolvedValue("생성된 답변");
});

describe("질문 직접 경로 접근 경계", () => {
  it("교사는 담당 밖 공개 질문의 상세 내용을 읽을 수 없다", async () => {
    selectedQuestion = outsideQuestion;

    const response = await getQuestion(
      request(`/api/questions/${outsideQuestion.id}`),
      params(outsideQuestion.id),
    );

    expect(response.status).toBe(403);
    const loadedFullDetail = mockQuestionFind.mock.calls.some(
      ([query]) => Boolean(query?.include?.comments),
    );
    expect(loadedFullDetail).toBe(false);
  });

  it("학생은 다른 학교 공개 질문에 좋아요를 쓸 수 없다", async () => {
    selectedViewer = student;
    selectedQuestion = outsideQuestion;
    mockAuth.mockResolvedValue({ user: student });

    const response = await createLike(
      request(`/api/questions/${outsideQuestion.id}/likes`, "POST"),
      params(outsideQuestion.id),
    );

    expect(response.status).toBe(403);
    expect(mockLikeCreate).not.toHaveBeenCalled();
    expect(mockLikeCount).not.toHaveBeenCalled();
  });

  it("학생은 같은 학급 공개 질문이어도 질문수업 대상이 아니면 좋아요를 쓸 수 없다", async () => {
    selectedViewer = student;
    selectedQuestion = unassignedQuestion;
    mockAuth.mockResolvedValue({ user: student });

    const response = await createLike(
      request(`/api/questions/${unassignedQuestion.id}/likes`, "POST"),
      params(unassignedQuestion.id),
    );

    expect(response.status).toBe(403);
    expect(mockLikeCreate).not.toHaveBeenCalled();
  });

  it("학생은 자기 질문이어도 현재 질문수업 대상에서 제외되면 상세를 볼 수 없다", async () => {
    selectedViewer = student;
    selectedQuestion = selfUnassignedQuestion;
    mockAuth.mockResolvedValue({ user: student });

    const response = await getQuestion(
      request(`/api/questions/${selfUnassignedQuestion.id}`),
      params(selfUnassignedQuestion.id),
    );

    expect(response.status).toBe(403);
  });

  it("현재 질문 열람 권한이 없어도 본인이 남긴 좋아요는 취소할 수 있다", async () => {
    selectedViewer = student;
    selectedQuestion = outsideQuestion;
    mockAuth.mockResolvedValue({ user: student });

    const response = await deleteLike(
      request(`/api/questions/${outsideQuestion.id}/likes`, "DELETE"),
      params(outsideQuestion.id),
    );

    expect(response.status).toBe(200);
    expect(mockLikeDelete).toHaveBeenCalledWith({
      where: {
        questionId_userId: {
          questionId: outsideQuestion.id,
          userId: student.id,
        },
      },
    });
  });

  it("교사는 담당 밖 공개 질문으로 단일 인공지능 답변을 만들 수 없다", async () => {
    selectedQuestion = outsideQuestion;

    const response = await createAiAnswer(
      request(`/api/questions/${outsideQuestion.id}/ai-answer`, "POST"),
      params(outsideQuestion.id),
    );

    expect(response.status).toBe(403);
    expect(mockGenerateText).not.toHaveBeenCalled();
    const loadedUnscopedContent = mockQuestionFind.mock.calls.some(
      ([query]) => query?.where?.id === outsideQuestion.id && !query?.select,
    );
    expect(loadedUnscopedContent).toBe(false);
  });

  it("담당 교사는 담당 학급 공개 질문의 상세 내용을 계속 읽을 수 있다", async () => {
    const response = await getQuestion(
      request(`/api/questions/${assignedQuestion.id}`),
      params(assignedQuestion.id),
    );

    expect(response.status).toBe(200);
  });

  it("담당 교사는 담당 학급 학생 질문에 좋아요를 쓸 수 있다", async () => {
    const response = await createLike(
      request(`/api/questions/${assignedQuestion.id}/likes`, "POST"),
      params(assignedQuestion.id),
    );

    expect(response.status).toBe(201);
    expect(mockLikeCreate).toHaveBeenCalledWith({
      data: { questionId: assignedQuestion.id, userId: teacher.id },
    });
  });

  it("같은 학급 학생은 담당 범위 공개 질문에 좋아요를 계속 쓸 수 있다", async () => {
    selectedViewer = student;
    mockAuth.mockResolvedValue({ user: student });

    const response = await createLike(
      request(`/api/questions/${assignedQuestion.id}/likes`, "POST"),
      params(assignedQuestion.id),
    );

    expect(response.status).toBe(201);
    expect(mockLikeCreate).toHaveBeenCalledWith({
      data: { questionId: assignedQuestion.id, userId: student.id },
    });
  });

  it("담당 교사는 담당 학급 질문의 단일 인공지능 답변을 계속 만들 수 있다", async () => {
    const response = await createAiAnswer(
      request(`/api/questions/${assignedQuestion.id}/ai-answer`, "POST"),
      params(assignedQuestion.id),
    );

    expect(response.status).toBe(200);
    expect(mockGenerateText).toHaveBeenCalledOnce();
  });
});
