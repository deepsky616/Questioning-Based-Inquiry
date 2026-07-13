import { describe, expect, it } from "vitest";
import { consumePracticeDraft, practiceDraftKey, writePracticeDraft } from "@/lib/practice-draft";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

class ThrowingStorage extends MemoryStorage {
  constructor(private operation: "get" | "set" | "remove") {
    super();
  }

  override getItem(key: string) {
    if (this.operation === "get") throw new Error("blocked");
    return super.getItem(key);
  }

  override setItem(key: string, value: string) {
    if (this.operation === "set") throw new Error("blocked");
    super.setItem(key, value);
  }

  override removeItem(key: string) {
    if (this.operation === "remove") throw new Error("blocked");
    super.removeItem(key);
  }
}

describe("연습 질문 임시 초안", () => {
  it("현재 학생의 30분 이내 초안을 한 번만 읽는다", () => {
    const storage = new MemoryStorage();
    writePracticeDraft(
      storage,
      "s1",
      {
        content: "환경 보호를 위해 일회용품 사용을 제한해야 할까요?",
        mode: "create",
        target: "controversial",
      },
      new Date("2026-07-13T00:00:00Z"),
    );

    expect(consumePracticeDraft(storage, "s1", new Date("2026-07-13T00:10:00Z"))?.content).toContain(
      "일회용품",
    );
    expect(consumePracticeDraft(storage, "s1", new Date("2026-07-13T00:10:01Z"))).toBeNull();
  });

  it("다른 학생과 30분이 지난 초안을 거부한다", () => {
    const storage = new MemoryStorage();
    writePracticeDraft(
      storage,
      "s1",
      { content: "질문입니다", mode: "transform", target: "open" },
      new Date("2026-07-13T00:00:00Z"),
    );

    expect(consumePracticeDraft(storage, "s2", new Date("2026-07-13T00:01:00Z"))).toBeNull();
    expect(consumePracticeDraft(storage, "s1", new Date("2026-07-13T00:31:00Z"))).toBeNull();
  });

  it.each([
    [
      "작성 학생 불일치",
      {
        version: 1,
        studentId: "s2",
        createdAt: "2026-07-13T00:00:00Z",
        content: "질문입니다",
        mode: "create",
        target: "conceptual",
      },
    ],
    [
      "지원하지 않는 버전",
      {
        version: 2,
        studentId: "s1",
        createdAt: "2026-07-13T00:00:00Z",
        content: "질문입니다",
        mode: "create",
        target: "conceptual",
      },
    ],
    [
      "미래 생성 시각",
      {
        version: 1,
        studentId: "s1",
        createdAt: "2026-07-13T00:02:00Z",
        content: "질문입니다",
        mode: "create",
        target: "conceptual",
      },
    ],
    [
      "잘못된 생성 시각",
      {
        version: 1,
        studentId: "s1",
        createdAt: "invalid",
        content: "질문입니다",
        mode: "create",
        target: "conceptual",
      },
    ],
    [
      "200자 초과",
      {
        version: 1,
        studentId: "s1",
        createdAt: "2026-07-13T00:00:00Z",
        content: "가".repeat(201),
        mode: "create",
        target: "conceptual",
      },
    ],
    [
      "빈 질문",
      {
        version: 1,
        studentId: "s1",
        createdAt: "2026-07-13T00:00:00Z",
        content: " ",
        mode: "create",
        target: "conceptual",
      },
    ],
    [
      "허용하지 않는 연습 방식",
      {
        version: 1,
        studentId: "s1",
        createdAt: "2026-07-13T00:00:00Z",
        content: "질문입니다",
        mode: "quiz",
        target: "conceptual",
      },
    ],
    [
      "허용하지 않는 목표",
      {
        version: 1,
        studentId: "s1",
        createdAt: "2026-07-13T00:00:00Z",
        content: "질문입니다",
        mode: "create",
        target: "factual",
      },
    ],
  ])("%s 값을 거부하고 현재 키를 지운다", (_name, value) => {
    const storage = new MemoryStorage();
    storage.setItem(practiceDraftKey("s1"), JSON.stringify(value));

    expect(consumePracticeDraft(storage, "s1", new Date("2026-07-13T00:01:00Z"))).toBeNull();
    expect(storage.getItem(practiceDraftKey("s1"))).toBeNull();
  });

  it("잘못된 JSON을 거부하고 현재 키를 지운다", () => {
    const storage = new MemoryStorage();
    storage.setItem(practiceDraftKey("s1"), "{");

    expect(consumePracticeDraft(storage, "s1", new Date("2026-07-13T00:01:00Z"))).toBeNull();
    expect(storage.getItem(practiceDraftKey("s1"))).toBeNull();
  });

  it("임시 저장소가 차단되어도 예외를 밖으로 내보내지 않는다", () => {
    const input = { content: "질문입니다", mode: "create", target: "conceptual" } as const;
    expect(writePracticeDraft(new ThrowingStorage("set"), "s1", input)).toBe(false);
    expect(consumePracticeDraft(new ThrowingStorage("get"), "s1")).toBeNull();

    const removeBlocked = new ThrowingStorage("remove");
    MemoryStorage.prototype.setItem.call(
      removeBlocked,
      practiceDraftKey("s1"),
      JSON.stringify({
        version: 1,
        studentId: "s1",
        createdAt: new Date().toISOString(),
        ...input,
      }),
    );
    expect(consumePracticeDraft(removeBlocked, "s1")).toBeNull();
  });

  it("저장할 때 질문 양쪽 공백을 없애고 200자로 제한한다", () => {
    const storage = new MemoryStorage();
    expect(
      writePracticeDraft(storage, "s1", {
        content: `  ${"가".repeat(205)}  `,
        mode: "create",
        target: "conceptual",
      }),
    ).toBe(true);

    expect(consumePracticeDraft(storage, "s1")?.content).toBe("가".repeat(200));
  });
});
