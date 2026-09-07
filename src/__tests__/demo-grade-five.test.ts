import { describe, expect, it } from "vitest";
import { GRADE_FIVE_LESSONS, buildGradeFiveDesign, gradeFiveComment } from "../../scripts/demo-grade-five-content.mjs";
import { DEMO_SESSION_BLUEPRINTS, buildDemoLearningActivityPlans, STUDENT_NAMES } from "../../scripts/seed-usb-demo.mjs";
import { buildGradeFiveMigration, verifyGradeFiveMigration } from "../../scripts/migrate-usb-demo-grade-five.mjs";
import curriculum from "@/data/curriculum-achievements.json";

describe("5학년 수업 내용과 성취기준", () => {
  it("여덟 수업은 5~6학년군의 실제 성취기준과 일치하고 서로 다른 주제를 다룬다", () => {
    expect(new Set(DEMO_SESSION_BLUEPRINTS.map((session) => session.topic)).size).toBe(8);
    const data = curriculum["5-6"] as Record<string, Record<string, {achievements: {code:string;content:string}[]}>>;
    for (const session of DEMO_SESSION_BLUEPRINTS) {
      const design=buildGradeFiveDesign(session);
      expect(design.grade).toBe("5");
      expect(design.gradeRange).toBe("5-6");
      const allowed=Object.values(data[design.subject]).flatMap((area)=>area.achievements);
      for(const achievement of design.achievements) expect(allowed).toContainEqual(achievement);
      expect(design.inquiryQuestions).toHaveLength(5);
      expect(JSON.stringify(design)).not.toMatch(/4학년|\[4(?:국|수|사|과)/);
    }
  });
  it("사실적 질문도 응답 범위에 따라 열린 질문과 닫힌 질문으로 나눈다", () => {
    expect(GRADE_FIVE_LESSONS.pastKorean.questions[1]).toMatchObject({type:"factual",closure:"open"});
    expect(GRADE_FIVE_LESSONS.pastMath.questions[2]).toMatchObject({type:"factual",closure:"closed"});
    expect(GRADE_FIVE_LESSONS.pastSocial.questions[0]).toMatchObject({type:"factual",closure:"open"});
  });
  it("평균, 삼각형, 사다리꼴의 계산 예시가 올바르다", () => {
    expect(GRADE_FIVE_LESSONS.pastMath.questions[2].answer).toContain("24 나누기 4인 6");
    expect(GRADE_FIVE_LESSONS.exploreMath.questions[1].answer).toContain("20제곱센티미터");
    expect(GRADE_FIVE_LESSONS.exploreMath.questions[4].answer).toContain("18제곱센티미터");
    expect(GRADE_FIVE_LESSONS.past.questions[3].answer).toContain("시간");
    expect(GRADE_FIVE_LESSONS.past.questions[3].answer).toContain("최대로 녹는 양");
  });
  it("모든 학생 질문에는 같은 수업 주제의 구체적인 답변이 연결된다", () => {
    const ids=STUDENT_NAMES.map((_,index)=>`usb-demo-student-${String(index+1).padStart(2,"0")}`);
    const plans=buildDemoLearningActivityPlans(ids);
    for(const question of plans.questions) {
      const answer=gradeFiveComment(question,0);
      expect(answer.length).toBeGreaterThan(30);
      const lesson=Object.values(GRADE_FIVE_LESSONS).find((lesson)=>lesson.topic===question.context)!;
      const matching=lesson.questions.find((item)=>question.content.includes(item.content))!;
      expect(answer).toBe(matching.answer);
    }
    expect(()=>gradeFiveComment({context:"알 수 없는 수업",content:"질문"})).toThrow();
  });
});

describe("5학년 전환 데이터 보존", () => {
  it("예상 계정이 누락된 자료에는 변경 계획을 만들지 않는다", () => {
    expect(()=>buildGradeFiveMigration({users:[]})).toThrow("시연 계정 목록");
  });
  it("허용된 학년·내용 변경을 검사하고 포인트·댓글 연결의 변화는 거절한다", () => {
    const before={users:[{id:"student",grade:"4",totalPoints:43}],comments:[{id:"comment",questionId:"question-a",content:"이전"}],likes:[{id:"like",questionId:"question-a"}]};
    const plan={users:[{id:"student",data:{grade:"5"}}],comments:[{id:"comment",data:{content:"새 내용"}}]};
    const after={users:[{id:"student",grade:"5",totalPoints:43}],comments:[{id:"comment",questionId:"question-a",content:"새 내용"}],likes:before.likes};
    expect(()=>verifyGradeFiveMigration(before,after,plan)).not.toThrow();
    expect(()=>verifyGradeFiveMigration(before,{...after,users:[{...after.users[0],totalPoints:0}]},plan)).toThrow();
    expect(()=>verifyGradeFiveMigration(before,{...after,comments:[{...after.comments[0],questionId:"question-b"}]},plan)).toThrow();
    expect(()=>verifyGradeFiveMigration(before,{...after,likes:[]},plan)).toThrow();
  });
});
