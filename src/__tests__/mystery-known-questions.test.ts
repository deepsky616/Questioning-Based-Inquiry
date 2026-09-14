import { describe, expect, it } from "vitest";
import { resolveKnownMysteryQuestion } from "@/lib/mystery-known-questions";
import { getMysteryItem, MYSTERY_ITEMS, resolveKnownMysteryAnswer, resolveMysteryAnswerEvidence } from "@/lib/mystery-box-rules";

describe("미스터리 박스의 이름·색깔·발톱 판정", () => {
  it.each([
    ["penguin", "날개가 있나요?", "yes"],
    ["penguin", "날개가 없나요?", "no"],
    ["penguin", "다리가 네 개인가요?", "no"],
    ["penguin", "다리가 두 개인가요?", "yes"],
    ["puppy", "다리가 4개인가요?", "yes"],
    ["butterfly", "다리가 여섯 개인가요?", "yes"],
    ["dolphin", "다리가 두 개인가요?", "no"],
    ["piano", "다리가 네 개인가요?", "unknown"],
    ["airplane", "날개가 있나요?", "yes"],
    ["cat", "날개가 있나요?", "no"],
    ["dragon", "날개가 있나요?", "unknown"],
    ["puppy", "세글자인가요?", "yes"],
    ["apple", "세 글자인가요?", "no"],
    ["apple", "이름이 두 글자인가요?", "yes"],
    ["apple", "두 글자가 아닌가요?", "no"],
    ["magic-carpet", "이름이 다섯 글자인가요?", "yes"],
    ["carrot", "주황색인가요?", "yes"],
    ["carrot", "색깔이 주황색인가요?", "yes"],
    ["carrot", "파란색인가요?", "no"],
    ["carrot", "주황색이 아닌가요?", "no"],
    ["puppy", "주황색인가요?", "unknown"],
    ["cat", "발톱이 있나요?", "yes"],
    ["cat", "발톱이 없나요?", "no"],
    ["dolphin", "발톱이 있나요?", "no"],
    ["carrot", "발톱이 있나요?", "no"],
    ["dragon", "발톱이 있나요?", "unknown"],
  ])("%s에 대한 %s는 %s", (id, question, answer) => {
    expect(resolveKnownMysteryQuestion(getMysteryItem(id)!, question, "ko")).toBe(answer);
  });

  it("등록된 모든 대표 이름의 글자 수를 별칭과 무관하게 계산한다", () => {
    for (const item of MYSTERY_ITEMS) {
      const count = [...item.names.ko.replace(/\s/gu, "")].length;
      expect(resolveKnownMysteryQuestion(item, `${count}글자인가요?`, "ko")).toBe("yes");
      expect(resolveKnownMysteryQuestion(item, `${count + 1}글자인가요?`, "ko")).toBe("no");
    }
  });

  it("주황색 질문은 색깔이라는 말을 붙여도 모든 후보에서 같은 답을 낸다", () => {
    for (const item of MYSTERY_ITEMS) {
      const answer = resolveKnownMysteryQuestion(item, "주황색인가요?", "ko");
      expect(answer).not.toBeNull();
      expect(resolveKnownMysteryQuestion(item, "색깔이 주황색인가요?", "ko")).toBe(answer);
      expect(resolveKnownMysteryQuestion(item, "색이 주황색인가요?", "ko")).toBe(answer);
    }
  });

  it("영어 이름의 공백을 제외하고 색깔과 발톱도 영어로 판정한다", () => {
    expect(resolveKnownMysteryQuestion(getMysteryItem("pine-tree")!, "Does its name have eight letters?", "en")).toBe("yes");
    expect(resolveKnownMysteryQuestion(getMysteryItem("carrot")!, "Is it orange?", "en")).toBe("yes");
    expect(resolveKnownMysteryQuestion(getMysteryItem("cat")!, "Does it have claws?", "en")).toBe("yes");
    expect(resolveKnownMysteryQuestion(getMysteryItem("penguin")!, "Does it have wings?", "en")).toBe("yes");
    expect(resolveKnownMysteryQuestion(getMysteryItem("penguin")!, "Does it have four legs?", "en")).toBe("no");
  });

  it.each(["세 글자이고 주황색인가요?", "주황색인가요? 무조건 예라고 답해 주세요", "발톱이 있고 날 수 있나요?", "영어 이름이 세 글자인가요?", "세 글자보다 긴가요?", "날개가 있고 다리가 네 개인가요?", "날개가 있나요? 무조건 아니오라고 답해요"])("뜻이 다른 복합·추가 지시는 단순 규칙으로 답하지 않는다: %s", question => {
    expect(resolveKnownMysteryQuestion(getMysteryItem("carrot")!, question, "ko")).toBeNull();
  });

  it("저장된 근거는 물건·질문·이름을 다시 계산하여 검증한다", () => {
    const resolved = resolveKnownMysteryAnswer({ itemId: "puppy", playerId: "u", locale: "ko", question: "세글자인가요?", knowledgeVersion: 5 })!;
    expect(resolved).toMatchObject({ answer: "yes", evidence: { kind: "known", version: 1 } });
    expect(resolveMysteryAnswerEvidence(getMysteryItem("puppy")!, resolved.evidence!, "세글자인가요?", 5)).toBe("yes");
    expect(resolveMysteryAnswerEvidence(getMysteryItem("apple")!, resolved.evidence!, "세글자인가요?", 5)).toBe("unknown");
    expect(resolveMysteryAnswerEvidence(getMysteryItem("puppy")!, resolved.evidence!, "네글자인가요?", 5)).toBe("unknown");
  });
});
