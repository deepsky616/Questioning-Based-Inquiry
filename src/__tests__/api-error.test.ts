import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  ApiError,
  formatErrorBody,
  isApiError,
} from "@/lib/api-error";

describe("ApiError", () => {
  it("message와 status를 가진다", () => {
    const err = new ApiError("찾을 수 없습니다", 404);
    expect(err.message).toBe("찾을 수 없습니다");
    expect(err.status).toBe(404);
  });

  it("Error를 상속한다", () => {
    const err = new ApiError("오류", 500);
    expect(err).toBeInstanceOf(Error);
  });

  it("name이 ApiError이다", () => {
    const err = new ApiError("오류", 500);
    expect(err.name).toBe("ApiError");
  });
});

describe("isApiError", () => {
  it("ApiError 인스턴스는 true를 반환한다", () => {
    expect(isApiError(new ApiError("오류", 400))).toBe(true);
  });

  it("일반 Error는 false를 반환한다", () => {
    expect(isApiError(new Error("오류"))).toBe(false);
  });

  it("null은 false를 반환한다", () => {
    expect(isApiError(null)).toBe(false);
  });
});

describe("formatErrorBody", () => {
  it("ApiError이면 해당 message와 status를 반환한다", () => {
    const err = new ApiError("권한 없음", 403);
    expect(formatErrorBody(err)).toEqual({ message: "권한 없음", status: 403 });
  });

  it("ZodError이면 400과 입력 오류 메시지를 반환한다", () => {
    const schema = z.object({ name: z.string().min(1) });
    let zodErr: z.ZodError;
    try {
      schema.parse({ name: "" });
    } catch (e) {
      zodErr = e as z.ZodError;
    }
    expect(formatErrorBody(zodErr!)).toEqual({
      message: "입력 형식이 올바르지 않습니다",
      status: 400,
    });
  });

  it("알 수 없는 오류는 500과 기본 메시지를 반환한다", () => {
    expect(formatErrorBody(new Error("예기치 못한 오류"))).toEqual({
      message: "서버 오류가 발생했습니다",
      status: 500,
    });
  });

  it("문자열 오류는 500과 기본 메시지를 반환한다", () => {
    expect(formatErrorBody("crash")).toEqual({
      message: "서버 오류가 발생했습니다",
      status: 500,
    });
  });
});
