import { describe, expect, it } from "vitest";
import {
  createBrowserQuestionGameRunStore,
  type BrowserQuestionGameRunActor,
} from "../../e2e/helpers/question-game-run";
import { getKabaSentences } from "../lib/question-game-i18n";

const studentA: BrowserQuestionGameRunActor = {
  id: "browser-run-student-a",
  role: "STUDENT",
};
const studentB: BrowserQuestionGameRunActor = {
  id: "browser-run-student-b",
  role: "STUDENT",
};

const ids = Array.from(
  { length: 220 },
  (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);

function runId(response: { body: Record<string, unknown> }) {
  return (response.body.run as { id: string }).id;
}

describe("브라우저 질문놀이 실행 전송기", () => {
  it("생성과 학생 질문을 멱등 처리하고 마지막 질문을 같은 동작에서 정산한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const createBody = {
      gameId: "relay",
      mode: "solo",
      requestId: ids[0],
      topic: "우주",
      locale: "ko",
    };
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: createBody,
    });
    const id = runId(created);
    expect(created).toMatchObject({
      status: 201,
      body: {
        replayed: false,
        run: { id, status: "ACTIVE", version: 1, questionCount: 0 },
      },
    });

    const firstBody = {
      action: "relay-submit-question",
      requestId: ids[1],
      expectedVersion: 1,
      question: "우주에는 무엇이 있나요?",
      locale: "ko",
    };
    const first = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: firstBody,
    });
    const firstReplay = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: firstBody,
    });
    expect(first.body.run).toMatchObject({ version: 2, questionCount: 1 });
    expect(firstReplay).toMatchObject({
      status: 200,
      body: { replayed: true, run: { version: 2, questionCount: 1 } },
    });

    const second = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        action: "relay-submit-question",
        requestId: ids[2],
        expectedVersion: 2,
        question: "별은 왜 빛나나요?",
        locale: "ko",
      },
    });
    expect(second.body.run).toMatchObject({ status: "ACTIVE", version: 3 });

    const finalBody = {
      action: "relay-submit-question",
      requestId: ids[3],
      expectedVersion: 3,
      question: "그 빛은 어디까지 가나요?",
      locale: "ko",
    };
    const settled = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: finalBody,
    });
    expect(settled).toMatchObject({
      status: 200,
      body: {
        replayed: false,
        run: { status: "SETTLED", version: 4, questionCount: 3 },
        result: {
          awarded: 5,
          dailyLimit: 30,
          dailyRemaining: 25,
          cappedByLimit: false,
          preview: false,
        },
      },
    });

    const settledReplay = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: finalBody,
    });
    expect(settledReplay).toMatchObject({
      body: {
        replayed: true,
        run: { status: "SETTLED", version: 4 },
        result: { awarded: 5 },
      },
    });
    const lateFirstReplay = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: firstBody,
    });
    expect(lateFirstReplay).toMatchObject({
      body: {
        replayed: true,
        run: { status: "ACTIVE", version: 2, questionCount: 1 },
      },
    });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        ...firstBody,
        question: "같은 요청에 다른 질문인가요?",
      },
    })).toEqual({
      status: 409,
      body: { error: "같은 요청 식별값에 다른 동작이 들어왔습니다" },
    });
    const result = store.dispatch(studentA, {
      method: "GET",
      pathname: `/api/question-games/runs/${id}/result`,
      body: {},
    });
    expect(result.body).toMatchObject({
      run: { status: "SETTLED", version: 4 },
      result: { awarded: 5, alreadySettled: true },
    });
    const legacyComplete = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/complete`,
      body: { requestId: ids[4], expectedVersion: 4 },
    });
    expect(legacyComplete.body).toMatchObject({
      replayed: true,
      run: { version: 4 },
      result: { awarded: 5, alreadySettled: true },
    });

    const creationReplay = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: createBody,
    });
    expect(creationReplay).toMatchObject({
      status: 200,
      body: { replayed: true, run: { id, status: "SETTLED", version: 4 } },
    });
  });

  it("같은 요청 식별값도 사용자별로 분리하고 다른 사용자의 실행을 차단한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const body = {
      gameId: "relay",
      mode: "solo",
      requestId: ids[5],
      topic: "바다",
      locale: "ko",
    };
    const first = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body,
    });
    const second = store.dispatch(studentB, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body,
    });
    expect(runId(first)).not.toBe(runId(second));

    expect(store.dispatch(studentB, {
      method: "GET",
      pathname: `/api/question-games/runs/${runId(first)}/result`,
      body: {},
    })).toEqual({
      status: 403,
      body: { error: "자신의 질문놀이 실행만 이용할 수 있습니다" },
    });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${runId(second)}/actions`,
      body: {
        action: "relay-submit-question",
        requestId: ids[6],
        expectedVersion: 1,
        question: "다른 학생의 질문인가요?",
        locale: "ko",
      },
    }).status).toBe(403);
  });

  it("인공지능 발급과 기록 요청도 재생해 차례를 한 번만 진행한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: {
        gameId: "relay",
        mode: "ai",
        requestId: ids[7],
        topic: "자연",
        locale: "ko",
      },
    });
    const id = runId(created);
    store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        action: "relay-submit-question",
        requestId: ids[8],
        expectedVersion: 1,
        question: "나무는 어떻게 자라나요?",
        locale: "ko",
      },
    });
    const issueBody = {
      requestId: ids[9],
      expectedVersion: 2,
      topic: "자연",
      previousQuestion: "나무는 어떻게 자라나요?",
      locale: "ko",
    };
    const issued = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/ai-turn`,
      body: issueBody,
    });
    const issueReplay = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/ai-turn`,
      body: issueBody,
    });
    expect(issueReplay).toEqual(issued);

    const issuedBody = issued.body as {
      output: string;
      proof: string;
    };
    const recordBody = {
      action: "relay-record-ai-turn",
      requestId: ids[10],
      generationRequestId: ids[9],
      expectedVersion: 2,
      output: issuedBody.output,
      proof: issuedBody.proof,
    };
    const recorded = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: recordBody,
    });
    const recordReplay = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: recordBody,
    });
    expect(recorded.body.run).toMatchObject({
      version: 3,
      questionCount: 1,
      aiTurnCount: 1,
      awaitingAiTurn: false,
    });
    expect(recordReplay).toMatchObject({
      body: { replayed: true, run: { version: 3, aiTurnCount: 1 } },
    });
  });

  it("질문 주사위 혼자 모드의 굴리기와 질문을 세 번 처리하고 마지막 질문에서 정산한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const createBody = {
      gameId: "dice",
      mode: "solo",
      requestId: ids[12],
      locale: "ko",
    };
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: createBody,
    });
    const id = runId(created);
    expect(created).toMatchObject({
      status: 201,
      body: {
        run: {
          gameId: "dice",
          status: "ACTIVE",
          version: 1,
          nextStep: "STUDENT_ROLL",
          pendingRoll: null,
        },
      },
    });

    let version = 1;
    let finalResponse = created;
    for (let index = 0; index < 3; index += 1) {
      const rollBody = {
        action: "dice-roll",
        requestId: ids[13 + index * 2],
        expectedVersion: version,
        face: 99,
      };
      const rolled = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: rollBody,
      });
      const rolledRun = rolled.body.run as {
        pendingRoll: { actor: string; face: number };
      };
      expect(rolledRun.pendingRoll).toMatchObject({ actor: "STUDENT" });
      expect(rolledRun.pendingRoll.face).toBeGreaterThanOrEqual(1);
      expect(rolledRun.pendingRoll.face).toBeLessThanOrEqual(6);
      if (index === 0) {
        const replay = store.dispatch(studentA, {
          method: "POST",
          pathname: `/api/question-games/runs/${id}/actions`,
          body: rollBody,
        });
        expect(replay).toMatchObject({
          status: 200,
          body: {
            replayed: true,
            run: {
              version: 2,
              pendingRoll: { actor: "STUDENT", face: rolledRun.pendingRoll.face },
            },
          },
        });
      }
      version += 1;

      finalResponse = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: {
          action: "dice-submit-question",
          requestId: ids[14 + index * 2],
          expectedVersion: version,
          question: `주사위 질문 ${index + 1}은 무엇인가요?`,
          locale: "ko",
        },
      });
      version += 1;
    }

    expect(finalResponse).toMatchObject({
      status: 200,
      body: {
        replayed: false,
        run: {
          status: "SETTLED",
          version: 7,
          questionCount: 3,
          nextStep: "COMPLETE",
          pendingRoll: null,
        },
        result: {
          awarded: 5,
          dailyLimit: 30,
          dailyRemaining: 25,
          preview: false,
        },
      },
    });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        action: "dice-submit-question",
        requestId: ids[18],
        expectedVersion: 6,
        question: "주사위 질문 3은 무엇인가요?",
        locale: "ko",
      },
    })).toMatchObject({
      status: 200,
      body: {
        replayed: true,
        run: { status: "SETTLED", version: 7 },
        result: { awarded: 5, dailyRemaining: 25 },
      },
    });
    expect(store.dispatch(studentB, {
      method: "GET",
      pathname: `/api/question-games/runs/${id}/result`,
      body: {},
    })).toEqual({
      status: 403,
      body: { error: "자신의 질문놀이 실행만 이용할 수 있습니다" },
    });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: createBody,
    })).toMatchObject({
      status: 200,
      body: { replayed: true, run: { id, status: "SETTLED", version: 7 } },
    });
  });

  it("질문 주사위 도움 모드에서 학생과 인공지능 차례를 지키고 구 점을 정산한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: {
        gameId: "dice",
        mode: "ai",
        requestId: ids[20],
        locale: "ko",
      },
    });
    const id = runId(created);
    let version = 1;
    let finalResponse = created;

    for (let index = 0; index < 3; index += 1) {
      const studentRoll = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: {
          action: "dice-roll",
          requestId: ids[21 + index * 5],
          expectedVersion: version,
        },
      });
      expect(studentRoll.body.run).toMatchObject({
        nextStep: "STUDENT_QUESTION",
        pendingRoll: { actor: "STUDENT" },
      });
      version += 1;

      finalResponse = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: {
          action: "dice-submit-question",
          requestId: ids[22 + index * 5],
          expectedVersion: version,
          question: `도움 모드 질문 ${index + 1}은 무엇인가요?`,
          locale: "ko",
        },
      });
      version += 1;
      if (index === 2) break;
      expect(finalResponse.body.run).toMatchObject({
        nextStep: "AI_ROLL",
        pendingRoll: null,
      });

      const aiRoll = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: {
          action: "dice-roll",
          requestId: ids[23 + index * 5],
          expectedVersion: version,
        },
      });
      expect(aiRoll.body.run).toMatchObject({
        nextStep: "AI_QUESTION",
        awaitingAiTurn: true,
        pendingRoll: { actor: "AI" },
      });
      version += 1;

      const issueBody = {
        requestId: ids[24 + index * 5],
        expectedVersion: version,
        locale: "ko",
      };
      const issued = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/ai-turn`,
        body: issueBody,
      });
      expect(store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/ai-turn`,
        body: issueBody,
      })).toEqual(issued);
      const issuedBody = issued.body as { output: string; proof: string };
      const recordBody = {
        action: "dice-record-ai-question",
        requestId: ids[25 + index * 5],
        generationRequestId: issueBody.requestId,
        expectedVersion: version,
        output: issuedBody.output,
        proof: issuedBody.proof,
      };
      const recorded = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: recordBody,
      });
      expect(recorded.body.run).toMatchObject({
        nextStep: "STUDENT_ROLL",
        pendingRoll: null,
        aiTurnCount: index + 1,
        awaitingAiTurn: false,
      });
      expect(store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: recordBody,
      })).toMatchObject({
        body: { replayed: true, run: { aiTurnCount: index + 1 } },
      });
      version += 1;
    }

    expect(finalResponse).toMatchObject({
      status: 200,
      body: {
        run: {
          status: "SETTLED",
          version: 11,
          questionCount: 3,
          aiTurnCount: 2,
          nextStep: "COMPLETE",
        },
        result: {
          awarded: 9,
          dailyLimit: 50,
          dailyRemaining: 41,
          preview: false,
        },
      },
    });
  });

  it("질문 주사위 점수를 같은 학생과 모드의 하루 누계에 합산한다", () => {
    const store = createBrowserQuestionGameRunStore();

    const finishSoloDice = (createIndex: number, actionStart: number) => {
      const created = store.dispatch(studentA, {
        method: "POST",
        pathname: "/api/question-games/runs",
        body: {
          gameId: "dice",
          mode: "solo",
          requestId: ids[createIndex],
          locale: "ko",
        },
      });
      const id = runId(created);
      let version = 1;
      let response = created;
      for (let index = 0; index < 3; index += 1) {
        response = store.dispatch(studentA, {
          method: "POST",
          pathname: `/api/question-games/runs/${id}/actions`,
          body: {
            action: "dice-roll",
            requestId: ids[actionStart + index * 2],
            expectedVersion: version,
          },
        });
        version += 1;
        response = store.dispatch(studentA, {
          method: "POST",
          pathname: `/api/question-games/runs/${id}/actions`,
          body: {
            action: "dice-submit-question",
            requestId: ids[actionStart + index * 2 + 1],
            expectedVersion: version,
            question: `하루 누계 질문 ${index + 1}은 무엇인가요?`,
            locale: "ko",
          },
        });
        version += 1;
      }
      return response;
    };

    expect(finishSoloDice(40, 41).body.result).toMatchObject({
      awarded: 5,
      dailyRemaining: 25,
    });
    expect(finishSoloDice(47, 48).body.result).toMatchObject({
      awarded: 5,
      dailyRemaining: 20,
    });
  });

  it("질문 사다리 주제 네 개와 서버 사다리 세 라운드를 처리하고 마지막 질문에서 정산한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const topics = ["우주", "바다", "날씨", "식물"];
    const createBody = {
      gameId: "ladder",
      mode: "solo",
      requestId: ids[60],
      topics,
      locale: "ko",
    };
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: createBody,
    });
    const id = runId(created);
    expect(created).toMatchObject({
      status: 201,
      body: {
        replayed: false,
        run: {
          id,
          gameId: "ladder",
          mode: "SOLO",
          status: "ACTIVE",
          version: 1,
          targetCount: 3,
          questionCount: 0,
          aiTurnCount: 0,
          awaitingAiTurn: false,
          ladderRound: 1,
        },
      },
    });
    const firstGrid = (created.body.run as { ladderGrid: boolean[][] }).ladderGrid;
    expect(firstGrid).toHaveLength(10);
    expect(firstGrid.every((row) => row.length === 3)).toBe(true);
    for (const topic of topics) {
      expect(JSON.stringify(created)).not.toContain(topic);
    }

    const questions = [
      "우주에는 어떤 비밀이 있나요?",
      "바다는 왜 계속 움직이나요?",
      "식물은 빛을 어떻게 이용하나요?",
    ];
    const startColumns = [0, 3, 1];
    let finalResponse = created;
    let finalBody: Record<string, unknown> | null = null;
    for (let index = 0; index < questions.length; index += 1) {
      const actionBody = {
        action: "ladder-submit-question",
        requestId: ids[61 + index],
        expectedVersion: index + 1,
        startColumn: startColumns[index],
        question: questions[index],
        locale: "ko",
      };
      finalResponse = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: actionBody,
      });
      if (index === 0) {
        expect(finalResponse).toMatchObject({
          status: 200,
          body: {
            replayed: false,
            run: {
              status: "ACTIVE",
              version: 2,
              questionCount: 1,
              ladderRound: 2,
            },
          },
        });
        const secondGrid = (finalResponse.body.run as { ladderGrid: boolean[][] }).ladderGrid;
        expect(secondGrid).toHaveLength(10);
        expect(secondGrid).not.toEqual(firstGrid);
        expect(store.dispatch(studentA, {
          method: "POST",
          pathname: `/api/question-games/runs/${id}/actions`,
          body: actionBody,
        })).toMatchObject({
          status: 200,
          body: {
            replayed: true,
            run: { version: 2, questionCount: 1, ladderRound: 2 },
          },
        });
      }
      expect(JSON.stringify(finalResponse)).not.toContain(questions[index]);
      if (index === questions.length - 1) finalBody = actionBody;
    }

    expect(finalResponse).toMatchObject({
      status: 200,
      body: {
        replayed: false,
        run: {
          status: "SETTLED",
          version: 4,
          questionCount: 3,
          aiTurnCount: 0,
          awaitingAiTurn: false,
          ladderRound: null,
          ladderGrid: null,
        },
        result: {
          awarded: 5,
          dailyLimit: 30,
          dailyRemaining: 25,
          cappedByLimit: false,
          preview: false,
        },
      },
    });
    if (!finalBody) throw new Error("마지막 질문 요청이 없습니다");
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: finalBody,
    })).toMatchObject({
      status: 200,
      body: {
        replayed: true,
        run: { status: "SETTLED", version: 4 },
        result: { awarded: 5 },
      },
    });
    expect(store.dispatch(studentA, {
      method: "GET",
      pathname: `/api/question-games/runs/${id}/result`,
      body: {},
    })).toMatchObject({
      status: 200,
      body: {
        run: { status: "SETTLED", version: 4, ladderRound: null },
        result: { awarded: 5, alreadySettled: true },
      },
    });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: createBody,
    })).toMatchObject({
      status: 200,
      body: { replayed: true, run: { id, status: "SETTLED", version: 4 } },
    });
    expect(store.dispatch(studentB, {
      method: "GET",
      pathname: `/api/question-games/runs/${id}/result`,
      body: {},
    })).toEqual({
      status: 403,
      body: { error: "자신의 질문놀이 실행만 이용할 수 있습니다" },
    });
  });

  it("질문 사다리 도움 모드는 주제 두 개를 받고 학생 질문 셋에 구 점을 정산한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const topics = ["도전", "협력"];
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: {
        gameId: "ladder",
        mode: "ai",
        requestId: ids[65],
        topics,
        locale: "ko",
      },
    });
    const id = runId(created);
    expect(created).toMatchObject({
      status: 201,
      body: {
        run: {
          gameId: "ladder",
          mode: "AI",
          status: "ACTIVE",
          ladderRound: 1,
          aiTurnCount: 0,
          awaitingAiTurn: false,
        },
      },
    });
    const grid = (created.body.run as { ladderGrid: boolean[][] }).ladderGrid;
    expect(grid).toHaveLength(10);
    expect(grid.every((row) => row.length === 1)).toBe(true);
    for (const topic of topics) expect(JSON.stringify(created)).not.toContain(topic);

    let finalResponse = created;
    for (let index = 0; index < 3; index += 1) {
      const question = `도움 사다리 질문 ${index + 1}은 무엇인가요?`;
      finalResponse = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: {
          action: "ladder-submit-question",
          requestId: ids[66 + index],
          expectedVersion: index + 1,
          startColumn: index % 2,
          question,
          locale: "ko",
        },
      });
      expect(JSON.stringify(finalResponse)).not.toContain(question);
    }
    expect(finalResponse).toMatchObject({
      status: 200,
      body: {
        run: {
          status: "SETTLED",
          version: 4,
          questionCount: 3,
          aiTurnCount: 0,
          ladderRound: null,
          ladderGrid: null,
        },
        result: {
          awarded: 9,
          dailyLimit: 50,
          dailyRemaining: 41,
          cappedByLimit: false,
          preview: false,
        },
      },
    });

    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: {
        gameId: "ladder",
        mode: "solo",
        requestId: ids[70],
        topics: ["하나", "둘"],
        locale: "ko",
      },
    }).status).toBe(400);
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: {
        gameId: "ladder",
        mode: "ai",
        requestId: ids[71],
        topics: ["하나", "둘", "셋", "넷"],
        locale: "ko",
      },
    }).status).toBe(400);
  });

  it("까바놀이 혼자 모드는 서버 문장 열 개를 차례로 공개하고 서버 판정 결과로 정산한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const createBody = {
      gameId: "kaba",
      mode: "solo",
      requestId: ids[72],
      locale: "ko",
    };
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: createBody,
    });
    const id = runId(created);
    expect(created).toMatchObject({
      status: 201,
      body: {
        replayed: false,
        run: {
          id,
          gameId: "kaba",
          mode: "SOLO",
          status: "ACTIVE",
          version: 1,
          questionCount: 0,
          correctCount: 0,
          targetCount: 10,
          currentSentence: getKabaSentences("ko")[0],
          kabaNextStep: "STUDENT_ATTEMPT",
        },
      },
    });
    expect(created.body.run).not.toHaveProperty("kabaSentencePlan");
    expect(JSON.stringify(created)).not.toContain(getKabaSentences("ko")[1]);

    const seenSentences: string[] = [];
    let response = created;
    let firstBody: Record<string, unknown> | null = null;
    for (let index = 0; index < 10; index += 1) {
      const run = response.body.run as { currentSentence: string };
      seenSentences.push(run.currentSentence);
      const correct = index < 6;
      const question = correct
        ? `서버가 판정할 질문 ${index + 1}은 무엇인가요?`
        : `질문이 아닌 답 ${index + 1}`;
      const body = {
        action: "kaba-submit-attempt",
        requestId: ids[73 + index],
        expectedVersion: index + 1,
        locale: "ko",
        question,
        correct: !correct,
        sentence: "사용자가 바꾼 문장",
      };
      response = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body,
      });
      expect(response.body.correct).toBe(correct);
      expect(response.body.run).toMatchObject({
        version: index + 2,
        questionCount: index + 1,
        correctCount: Math.min(index + 1, 6),
      });
      expect(JSON.stringify(response)).not.toContain(question);
      expect(JSON.stringify(response)).not.toContain("사용자가 바꾼 문장");
      if (index === 0) firstBody = body;
    }

    expect(new Set(seenSentences).size).toBe(10);
    const koreanSentences = new Set<string>(getKabaSentences("ko"));
    expect(seenSentences.every((sentence) => koreanSentences.has(sentence))).toBe(true);
    expect(response).toMatchObject({
      status: 200,
      body: {
        replayed: false,
        correct: false,
        run: {
          status: "SETTLED",
          version: 11,
          questionCount: 10,
          correctCount: 6,
          currentSentence: null,
          kabaNextStep: "COMPLETE",
        },
        result: {
          awarded: 8,
          dailyLimit: 30,
          dailyRemaining: 22,
          cappedByLimit: false,
          preview: false,
        },
      },
    });
    if (!firstBody) throw new Error("첫 까바놀이 요청이 없습니다");
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: firstBody,
    })).toMatchObject({
      status: 200,
      body: {
        replayed: true,
        correct: true,
        run: { version: 2, questionCount: 1, correctCount: 1 },
      },
    });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: createBody,
    })).toMatchObject({
      status: 200,
      body: { replayed: true, run: { id, status: "SETTLED", version: 11 } },
    });
    expect(store.dispatch(studentB, {
      method: "GET",
      pathname: `/api/question-games/runs/${id}/result`,
      body: {},
    })).toEqual({
      status: 403,
      body: { error: "자신의 질문놀이 실행만 이용할 수 있습니다" },
    });
  });

  it("까바놀이 도움 모드는 영어 문장과 서버 판정 일곱 개에 십칠 점을 정산한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: {
        gameId: "kaba",
        mode: "ai",
        requestId: ids[84],
        locale: "en",
      },
    });
    const id = runId(created);
    expect((created.body.run as { currentSentence: string }).currentSentence)
      .toBe(getKabaSentences("en")[0]);

    let response = created;
    for (let index = 0; index < 10; index += 1) {
      response = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: {
          action: "kaba-submit-attempt",
          requestId: ids[85 + index],
          expectedVersion: index + 1,
          locale: "en",
          question: index < 7
            ? `What is server question ${index + 1}?`
            : `Not a question ${index + 1}`,
        },
      });
    }

    expect(response).toMatchObject({
      status: 200,
      body: {
        run: {
          mode: "AI",
          status: "SETTLED",
          questionCount: 10,
          correctCount: 7,
          currentSentence: null,
          kabaNextStep: "COMPLETE",
        },
        result: {
          awarded: 17,
          dailyLimit: 50,
          dailyRemaining: 33,
          cappedByLimit: false,
        },
      },
    });
  });

  it("까바놀이 도움 모드 점수를 학생별 하루 상한까지만 합산한다", () => {
    const store = createBrowserQuestionGameRunStore();

    const finishPerfectRun = (createIndex: number, actionStart: number) => {
      const created = store.dispatch(studentA, {
        method: "POST",
        pathname: "/api/question-games/runs",
        body: {
          gameId: "kaba",
          mode: "ai",
          requestId: ids[createIndex],
          locale: "ko",
        },
      });
      const id = runId(created);
      let response = created;
      for (let index = 0; index < 10; index += 1) {
        response = store.dispatch(studentA, {
          method: "POST",
          pathname: `/api/question-games/runs/${id}/actions`,
          body: {
            action: "kaba-submit-attempt",
            requestId: ids[actionStart + index],
            expectedVersion: index + 1,
            locale: "ko",
            question: `상한 확인 질문 ${createIndex}-${index + 1}은 무엇인가요?`,
          },
        });
      }
      return response;
    };

    expect(finishPerfectRun(96, 97).body.result).toMatchObject({
      awarded: 23,
      dailyRemaining: 27,
      cappedByLimit: false,
    });
    expect(finishPerfectRun(107, 108).body.result).toMatchObject({
      awarded: 23,
      dailyRemaining: 4,
      cappedByLimit: false,
    });
    expect(finishPerfectRun(118, 119).body.result).toMatchObject({
      awarded: 4,
      dailyRemaining: 0,
      cappedByLimit: true,
    });
  });
});
