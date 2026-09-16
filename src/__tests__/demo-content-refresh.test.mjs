import { describe, expect, it } from 'vitest';
import { buildDemoLearningActivityPlans, STUDENT_NAMES } from '../../scripts/seed-usb-demo.mjs';
import { DEMO_QUESTION_VARIANTS, demoTextKey, takeDemoQuestion, demoQuestionChoices } from '../../scripts/demo-question-variety.mjs';
import { GRADE_FIVE_LESSONS } from '../../scripts/demo-grade-five-content.mjs';
import { buildDemoModerationQuestions } from '../../scripts/demo-moderation-content.mjs';
import { buildSciencePlan, previewScienceSnapshot, verifyScienceMigration, SCIENCE_SESSION_IDS } from '../../scripts/migrate-demo-science.mjs';
const ids = STUDENT_NAMES.map((_,i)=>`usb-demo-student-${String(i+1).padStart(2,'0')}`);
function snapshot() {
  const before = Object.fromEntries(['comments','growth','reviews','bank','notifications','analyses','pointLogs','claims','runs','activities','likes','practices'].map(k=>[k,[]]));
  before.users = ids.map((id,i)=>({id,name:i===0?'김질문':`학생${i}`,isDemo:true,role:'STUDENT',school:'질문초등학교',grade:'5',className:'1',totalPoints:0}));
  before.teachers=[{id:'usb-demo-teacher',name:'김탐구',school:'질문초등학교',role:'TEACHER',isDemo:true}];
  before.classes=[{id:'class',teacherId:'usb-demo-teacher',grade:'5',className:'1'}];
  before.sessions=SCIENCE_SESSION_IDS.map((id,i)=>({id,teacherId:'usb-demo-teacher',subject:'과학',targetGrade:'5',targetClassName:'1',unitDesignId:`design${i}`,date:'2026-09-15',topic:i===1?GRADE_FIVE_LESSONS.exploreMath.topic:GRADE_FIVE_LESSONS.pastMath.topic,sharedQuestions:[]}));
  before.designs=before.sessions.map(s=>({id:s.unitDesignId,teacherId:s.teacherId,grade:'5'}));
  const base=GRADE_FIVE_LESSONS.pastMath.questions[0];
  before.questions=[0,1].map(i=>({id:`question${i}`,sessionId:SCIENCE_SESSION_IDS[0],authorId:ids[i],source:'STUDENT',content:base.content,context:GRADE_FIVE_LESSONS.pastMath.topic,closure:base.closure,cognitive:base.type,isPublic:true,flagged:false}));
  before.comments=[{id:'comment',authorId:ids[2],questionId:'question1',content:'같은 답을 반복하던 댓글'}];
  return before;
}
describe('과학 시연 자료와 교사 검토 사례',()=>{
  it('학생 질문과 답변을 교실 전체에서 중복 없이 생성하고 다섯 검토 사례를 분리한다',()=>{
    const plan=buildDemoLearningActivityPlans(ids);
    const normal=plan.questions.filter(q=>!q.flagged);
    expect(new Set(normal.map(q=>demoTextKey(q.content))).size).toBe(normal.length);
    expect(new Set(plan.comments.map(c=>demoTextKey(c.content))).size).toBe(plan.comments.length);
    const flags=plan.questions.filter(q=>q.flagged);
    expect(flags).toHaveLength(5);
    expect(new Set(flags.map(q=>q.authorId)).size).toBe(5);
    for(const q of flags){expect(q.isPublic).toBe(false);expect(q.flagReason).toContain('시연용');expect(q.flagReason).toContain('교사 확인');expect(plan.comments.some(c=>c.questionId===q.id)).toBe(false);expect(plan.likes.some(l=>l.questionId===q.id)).toBe(false);}
    expect(plan.classInquiryQuestions.some(q=>flags.some(f=>f.content===q.content))).toBe(false);
  });
  it('문장 풀을 다 사용하면 반복하지 않고 중단한다',()=>{
    const lesson=GRADE_FIVE_LESSONS.pastMath;
    const used=new Set(demoQuestionChoices('pastMath',lesson,2).map(q=>demoTextKey(q.content)));
    expect(()=>takeDemoQuestion('pastMath',lesson,2,used)).toThrow('부족');
    for(const groups of Object.values(DEMO_QUESTION_VARIANTS))for(const group of groups)for(const q of group){expect(q.content.trim()).toBeTruthy();expect(q.answer.trim()).toBeTruthy();expect(new Set(q.comments.map(demoTextKey)).size).toBe(q.comments.length);}
  });
  it('기존 연결과 점수를 유지하며 질문과 답변을 함께 바꾸고 재실행은 추가하지 않는다',()=>{
    const before=snapshot();const plan=buildSciencePlan(before);const after=previewScienceSnapshot(before,plan);
    expect(plan.creates.questions).toHaveLength(5);
    expect(plan.updates.questions).toHaveLength(1);
    expect(plan.updates.comments).toHaveLength(1);
    expect(()=>verifyScienceMigration(before,after,plan)).not.toThrow();
    expect(buildSciencePlan(after).creates.questions).toHaveLength(0);
    const corrupted=structuredClone(after);corrupted.users[0].totalPoints++;
    expect(()=>verifyScienceMigration(before,corrupted,plan)).toThrow();
  });
  it('실제 학생이나 다른 교사의 수업이 섞이면 거절한다',()=>{
    const before=snapshot();before.users[0].isDemo=false;expect(()=>buildSciencePlan(before)).toThrow();
    const other=snapshot();other.sessions.push({...other.sessions[0],id:'other',teacherId:'real-teacher'});expect(()=>buildSciencePlan(other)).toThrow();
    expect(()=>buildDemoModerationQuestions({sessionId:'real-session',context:'과학',studentIds:ids})).toThrow();
  });
});
