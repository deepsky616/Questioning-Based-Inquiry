import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchJson } from "@/lib/client-fetch";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("화면 공통 자료 응답 처리", () => {
  it("정상 응답의 자료를 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ value: 3 }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    await expect(fetchJson<{ value: number }>("/api/sample"))
      .resolves.toEqual({ value: 3 });
  });

  it("성공 응답의 본문이 비어 있으면 불러오기 오류로 처리한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));

    await expect(fetchJson("/api/sample"))
      .rejects.toThrow("응답 내용이 비어 있습니다.");
  });

  it("응답 본문이 올바른 자료 형식이 아니면 불러오기 오류로 처리한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      "{\"value\":",
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    await expect(fetchJson("/api/sample"))
      .rejects.toThrow("응답 내용을 읽을 수 없습니다.");
  });

  it("실패 응답에 포함된 안내 문구를 보존한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ error: "권한이 없습니다." }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    )));

    await expect(fetchJson("/api/sample"))
      .rejects.toThrow("권한이 없습니다.");
  });
});
