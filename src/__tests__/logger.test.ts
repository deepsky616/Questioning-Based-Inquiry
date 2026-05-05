import { describe, it, expect, vi, beforeEach } from "vitest";
import { logger, formatLogMessage } from "@/lib/logger";

describe("formatLogMessage", () => {
  it("레벨과 메시지를 포함한 문자열을 반환한다", () => {
    const msg = formatLogMessage("ERROR", "DB 연결 실패");
    expect(msg).toContain("ERROR");
    expect(msg).toContain("DB 연결 실패");
  });

  it("Record 컨텍스트가 있으면 직렬화되어 포함된다", () => {
    const msg = formatLogMessage("WARN", "느린 쿼리", { duration: 500 });
    expect(msg).toContain("duration");
    expect(msg).toContain("500");
  });

  it("string 컨텍스트를 그대로 포함한다", () => {
    const msg = formatLogMessage("INFO", "이메일 결과", "email sent");
    expect(msg).toContain("email sent");
  });

  it("Error 객체는 message를 포함한다", () => {
    const msg = formatLogMessage("ERROR", "처리 실패", new Error("연결 거부"));
    expect(msg).toContain("연결 거부");
  });

  it("unknown 타입(catch 블록 error)을 처리한다", () => {
    const err: unknown = new Error("알 수 없는 오류");
    const msg = formatLogMessage("ERROR", "서버 오류", err);
    expect(msg).toContain("알 수 없는 오류");
  });

  it("null/undefined 컨텍스트는 메시지만 반환한다", () => {
    const msg = formatLogMessage("INFO", "시작", undefined);
    expect(msg).toContain("시작");
    expect(msg).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("타임스탬프 형식을 포함한다", () => {
    const msg = formatLogMessage("INFO", "시작");
    expect(msg).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("logger.info는 console.info를 호출한다", () => {
    logger.info("정보 메시지");
    expect(console.info).toHaveBeenCalledOnce();
  });

  it("logger.warn은 console.warn을 호출한다", () => {
    logger.warn("경고 메시지");
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("logger.error는 console.error를 호출한다", () => {
    logger.error("오류 메시지");
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("Record 컨텍스트 객체를 함께 기록한다", () => {
    logger.error("API 실패", { route: "/api/test", status: 500 });
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("string 컨텍스트를 받아 기록한다", () => {
    logger.info("이메일 결과", "email ok");
    expect(console.info).toHaveBeenCalledOnce();
  });

  it("Error 객체를 컨텍스트로 받아 기록한다", () => {
    logger.error("처리 실패", new Error("DB 오류"));
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("unknown 타입을 컨텍스트로 받아 기록한다", () => {
    const err: unknown = "string error";
    logger.error("알 수 없는 오류", err);
    expect(console.error).toHaveBeenCalledOnce();
  });
});
