import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.hoisted(() => vi.fn());
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent }; } }));
vi.mock('@/lib/resolve-ai-config', () => ({ resolveUserAiConfig: vi.fn(async () => ({ apiKey: 'test-key', model: 'gemini-2.5-flash', isDemo: true })) }));
vi.mock('@/lib/demo-ai-quota', () => ({ consumeDemoAiQuota: vi.fn(async () => 1) }));
vi.mock('@/lib/db', () => ({ prisma: {
  questionSession: { findUnique: vi.fn() }, user: { findUnique: vi.fn() },
  question: { findMany: vi.fn() }, comment: { findMany: vi.fn() },
  questionLike: { count: vi.fn() }, sessionAnalysis: { upsert: vi.fn() },
} }));

import { prisma } from '@/lib/db';
import { runStudentSessionAnalysis } from '@/lib/student-session-analysis';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.questionSession.findUnique).mockResolvedValue({ subject: '수학', topic: '평균으로 자료 비교하기' } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ name: '김질문', role: 'STUDENT' } as never);
  vi.mocked(prisma.question.findMany).mockResolvedValueOnce([{ content: '평균이 같으면 개인별 기록도 같을까요?', closure: 'open', cognitive: 'conceptual', _count: { likes: 2, comments: 1 } }] as never).mockResolvedValueOnce([]);
  vi.mocked(prisma.comment.findMany).mockResolvedValue([]);
  vi.mocked(prisma.questionLike.count).mockResolvedValue(1);
});

describe('시연 학생의 완성된 분석 응답', () => {
  it('시연 토큰 상한을 유지하면서 JSON 형식과 생각 예산을 전달하고 실제 모델을 저장한다', async () => {
    const data = { summary: '평균과 개별 자료를 연결했어요.', insights: '평균이 같은 다른 예를 찾아봐요.', relevanceInsights: '자료 비교라는 주제에 맞는 질문이에요.', growthInsights: '다음에는 조건도 비교해 봐요.', rewriteExample: '평균이 같아도 자료가 다를 수 있는 까닭은 무엇일까요?' };
    generateContent.mockResolvedValue({ text: JSON.stringify(data) });
    const result = await runStudentSessionAnalysis({ studentId: 'demo-output-student', sessionId: 'lesson', req: new Request('http://localhost', { headers: { cookie: 'NEXT_LOCALE=ko' } }) });
    const request = generateContent.mock.calls[0][0];
    expect(request.config.maxOutputTokens).toBe(2048);
    expect(request.config.thinkingConfig).toEqual({ thinkingBudget: 256 });
    expect(request.config.responseMimeType).toBe('application/json');
    expect(request.config.responseJsonSchema.required).toEqual(Object.keys(data));
    expect(request.contents).toContain('각 설명은 80자 이내');
    expect(request.contents).toContain('평균이 같으면 개인별 기록도 같을까요?');
    expect(result?.result).toMatchObject({ ...data, analysisModel: 'gemini-2.5-flash' });
    expect(prisma.sessionAnalysis.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { sessionId_scope_studentId: { sessionId: 'lesson', scope: 'student', studentId: 'demo-output-student' } }, create: expect.objectContaining({ result: expect.objectContaining({ summary: data.summary, analysisModel: 'gemini-2.5-flash' }) }) }));
  });

  it('불완전한 응답은 빈 분석으로 기존 결과를 덮어쓰지 않는다', async () => {
    generateContent.mockResolvedValue({ text: '{"summary":"중간에 끊어진 분석' });
    await expect(runStudentSessionAnalysis({ studentId: 'demo-output-incomplete', sessionId: 'lesson', req: new Request('http://localhost') })).rejects.toThrow('닫히지');
    expect(prisma.sessionAnalysis.upsert).not.toHaveBeenCalled();
  });
});
