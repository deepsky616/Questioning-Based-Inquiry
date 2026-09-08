import { expect, it } from "vitest";
import { buildDemoCommentRevisionPlan, verifyDemoCommentRevision } from "../../scripts/refresh-demo-comments.mjs";
import { VARIETY_STUDENT_IDS } from "../../scripts/demo-learning-variety.mjs";
import { GRADE_FIVE_LESSONS, gradeFiveComment } from "../../scripts/demo-grade-five-content.mjs";
import { GRADE_FIVE_COMMENT_VARIANTS } from "../../scripts/demo-grade-five-comments.mjs";

const question = { id: "q1", sessionId: "s1", context: GRADE_FIVE_LESSONS.past.topic, content: GRADE_FIVE_LESSONS.past.questions[0].content };
const before = () => ({
  users: VARIETY_STUDENT_IDS.map(id => ({ id, isDemo: true, role: "STUDENT", school: "질문초등학교", grade: "5", className: "1" })),
  sessions: [{ id: "s1", teacherId: "usb-demo-teacher" }], questions: [question],
  comments: Array.from({ length: 8 }, (_, i) => ({ id: `usb-demo-comment-${i}`, authorId: VARIETY_STUDENT_IDS[i], questionId: "q1", content: gradeFiveComment(question, i) })),
});
it("같은 질문의 시연 댓글도 서로 다른 의견을 배치하고 직접 추가하거나 고친 댓글은 보존한다", () => {
  const snapshot = before();
  snapshot.comments.push({ ...snapshot.comments[0], id: "user-created", content: "내가 직접 쓴 댓글이에요." });
  snapshot.comments.push({ ...snapshot.comments[0], id: "usb-demo-comment-edited", content: "시연 댓글을 직접 고쳤어요." });
  const plan = buildDemoCommentRevisionPlan(snapshot);
  expect(plan).toHaveLength(8);
  expect(new Set(plan.map(row => row.content)).size).toBe(8);
  expect(plan.every(row => GRADE_FIVE_COMMENT_VARIANTS.past[0].includes(row.content))).toBe(true);
  for (const change of plan) expect(snapshot.comments.find(row => row.id === change.id)).toMatchObject({ authorId: change.authorId, questionId: change.questionId });
  const after = { ...snapshot, comments: snapshot.comments.map(row => ({ ...row, ...plan.find(change => change.id === row.id) })) };
  expect(buildDemoCommentRevisionPlan(after)).toEqual([]);
});
it("실제 학생 또는 다른 교사의 댓글을 시연 자료로 바꾸지 않는다", () => {
  const snapshot = before(); snapshot.users[0].isDemo = false;
  expect(() => buildDemoCommentRevisionPlan(snapshot)).toThrow();
  const otherClass = before(); otherClass.sessions[0].teacherId = "another-teacher";
  expect(buildDemoCommentRevisionPlan(otherClass)).toEqual([]);
});
it("댓글 수정 후 포인트나 성장 기록이 달라지면 검증을 실패시킨다", () => {
  const snapshot = { comments: [], users: [{ id: "s1", totalPoints: 20 }], growth: [{ questionId: "q1", reflection: "내가 배운 점" }] };
  const plan = { comments: [], hashes: [] };
  expect(() => verifyDemoCommentRevision(snapshot, snapshot, plan)).not.toThrow();
  expect(() => verifyDemoCommentRevision(snapshot, { ...snapshot, users: [{ id: "s1", totalPoints: 21 }] }, plan)).toThrow();
  expect(() => verifyDemoCommentRevision(snapshot, { ...snapshot, growth: [] }, plan)).toThrow();
});
