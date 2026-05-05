import { describe, it, expect, vi, beforeEach } from "vitest";
import { logger, formatLogMessage } from "@/lib/logger";

describe("formatLogMessage", () => {
  it("레벨과 메시지를 포함한 문자열을 반환한다", () => {
    const msg = formatLogMessage("ERROR", "DB 연결 실패");
    expect(msg).toContain("ERROR");
    expect(msg).toContain("DB 연결 실패");
  });

  it("컨텍스트가 있으면 포함된다", () => {
    const msg = formatLogMessage("WARN", "느린 쿼리", { duration: 500 });
    expect(msg).toContain("duration");
    expect(msg).toContain("500");
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

  it("컨텍스트 객체를 함께 기록한다", () => {
    logger.error("API 실패", { route: "/api/test", status: 500 });
    expect(console.error).toHaveBeenCalledOnce();
  });
});
