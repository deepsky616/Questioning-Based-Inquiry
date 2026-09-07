import { describe, expect, it } from 'vitest';
import { buildDemoVarietyPlan, GAME_CAPS, VARIETY_STUDENT_IDS, VARIETY_PREFIX } from '../../scripts/demo-learning-variety.mjs';
import { verifyDemoVariety } from '../../scripts/enrich-usb-demo-learning.mjs';
import { DEMO_SESSION_BLUEPRINTS, buildDemoLearningActivityPlans } from '../../scripts/seed-usb-demo.mjs';
import { QUESTION_GAME_RULES } from '@/lib/question-game-rules';
import { SOLO_POINTS, AI_POINTS } from '@/lib/points-policy';
import { PRACTICE_QUIZ_BANK, PRACTICE_TRANSFORM_BANK, PRACTICE_CREATE_TOPICS } from '@/lib/question-practice-data';

const anchor=new Date('2026-09-07T01:00:00Z');
function snapshot(){
  const activity=buildDemoLearningActivityPlans(VARIETY_STUDENT_IDS);
  return {
    users:VARIETY_STUDENT_IDS.map((id,i)=>({id,name:i===0?'김질문':`학생${i+1}`,school:'질문초등학교',grade:'5',className:'1',role:'STUDENT',isDemo:true,totalPoints:0})),
    sessions:DEMO_SESSION_BLUEPRINTS.map(s=>({...s,teacherId:'usb-demo-teacher',targetGrade:'5'})),
    pointLogs:[],runs:[],activities:[],practices:[],analyses:[],claims:[],
    questions:activity.questions.map(q=>({...q,createdAt:new Date('2026-08-20T01:00:00Z')})),
    comments:activity.comments,likes:activity.likes,
  };
}

describe('학습 기록이 서로 다른 5학년 시연 자료',()=>{
  it('학생별 놀이·연습·질문·답변 횟수가 다르고 일곱 놀이를 다룬다',()=>{
    const before=snapshot();const plan=buildDemoVarietyPlan(before,anchor);
    expect(new Set(plan.creates.runs.map(r=>r.gameId)).size).toBe(7);
    for(const [kind,field] of [['runs','ownerId'],['practices','studentId'],['questions','authorId'],['comments','authorId'],['likes','userId']] as const){
      const rows: Array<{ownerId?:string|null;studentId?:string;authorId?:string;userId?:string}> = plan.creates[kind];
      const counts=VARIETY_STUDENT_IDS.map(id=>rows.filter(row=>row[field]===id).length);
      expect(new Set(counts).size).toBeGreaterThanOrEqual(5);
    }
    expect(new Set(plan.creates.practices.map(p=>p.correct))).toEqual(new Set([true,false]));
    expect(()=>buildDemoVarietyPlan({...before,users:before.users.map((u,i)=>i===3?{...u,isDemo:false}:u)},anchor)).toThrow('시연 학생');
    expect(()=>buildDemoVarietyPlan({...before,runs:[{id:VARIETY_PREFIX+'already'}]},anchor)).toThrow('중복');
  });
  it('추가 놀이 포인트는 실제 모드 정책과 질문 상한을 따른다',()=>{
    const plan=buildDemoVarietyPlan(snapshot(),anchor);
    for(const [id,cap] of Object.entries(GAME_CAPS))expect(cap).toBe(QUESTION_GAME_RULES[id as keyof typeof QUESTION_GAME_RULES].score.maxValidQuestionsPerPlayer);
    for(const run of plan.creates.runs){
      const activity=plan.creates.activities.find(a=>a.runId===run.id)!;
      const log=plan.creates.pointLogs.find(l=>l.gameRunId===run.id)!;
      const policy=run.mode==='AI'?AI_POINTS:SOLO_POINTS;
      expect(activity.validQuestionCount).toBeLessThanOrEqual(GAME_CAPS[run.gameId as keyof typeof GAME_CAPS]);
      expect(log.points).toBe(activity.validQuestionCount!*policy.PER_VALID_QUESTION+policy.COMPLETION);
      expect(log.gameId).toBe(`ACTIVITY_${run.mode}`);
      expect(run.createdAt.getTime()).toBeLessThan(run.completedAt.getTime());
      expect(run.completedAt.getTime()).toBeLessThan(anchor.getTime());
    }
    for(const user of plan.updates.users)expect(user.data.totalPoints).toBe(plan.creates.pointLogs.filter(l=>l.studentId===user.id).reduce((s,l)=>s+l.points,0));
  });
  it('실제 연습 문항에 연결하고 오답에는 지급 기록을 만들지 않는다',()=>{
    const plan=buildDemoVarietyPlan(snapshot(),anchor);
    const banks={quiz:PRACTICE_QUIZ_BANK,transform:PRACTICE_TRANSFORM_BANK,create:PRACTICE_CREATE_TOPICS};
    for(const attempt of plan.creates.practices){
      expect(banks[attempt.mode as keyof typeof banks].some(q=>q.id===attempt.itemId)).toBe(true);
      if(attempt.mode!=='quiz')expect(attempt.quizType).toBeNull();
      if(!attempt.correct)expect(plan.creates.pointLogs.some(l=>l.id===attempt.id)).toBe(false);
    }
    for(const like of plan.creates.likes){
      const question=[...snapshot().questions,...plan.creates.questions].find(q=>q.id===like.questionId)!;
      expect(question.authorId).not.toBe(like.userId);
    }
  });
  it('오후에 구성할 때 일부 오늘 기록을 넣되 미래 시각은 만들지 않는다',()=>{
    const now=new Date('2026-09-07T06:00:00Z');const plan=buildDemoVarietyPlan(snapshot(),now);
    const today=plan.creates.pointLogs.filter(l=>new Date(l.createdAt!).toISOString().startsWith('2026-09-07'));
    expect(today.length).toBeGreaterThan(5);
    expect(new Set(today.map(l=>l.studentId)).size).toBeLessThan(28);
    for(const log of today)expect(new Date(log.createdAt!).getTime()).toBeLessThan(now.getTime());
  });
  it('기존 기록과 지급 합계를 보존하고 허용하지 않은 내용 변경을 거절한다',()=>{
    const before={users:[{id:'student',totalPoints:5}],pointLogs:[{id:'old',studentId:'student',points:5,status:'APPROVED'}]};
    const plan={creates:{pointLogs:[{id:'new',studentId:'student',points:3,status:'APPROVED'}]},updates:{users:[{id:'student',data:{totalPoints:8}}]}};
    const after={users:[{id:'student',totalPoints:8}],pointLogs:[...before.pointLogs,...plan.creates.pointLogs]};
    expect(()=>verifyDemoVariety(before,after,plan)).not.toThrow();
    expect(()=>verifyDemoVariety(before,{...after,pointLogs:after.pointLogs.map(l=>l.id==='old'?{...l,points:4}:l)},plan)).toThrow();
    expect(()=>verifyDemoVariety(before,{...after,users:[{id:'student',totalPoints:9}]},plan)).toThrow();
  });
});
