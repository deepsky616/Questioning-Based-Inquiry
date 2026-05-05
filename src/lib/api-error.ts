import { z } from "zod";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export function formatErrorBody(error: unknown): { message: string; status: number } {
  if (error instanceof ApiError) {
    return { message: error.message, status: error.status };
  }
  if (error instanceof z.ZodError) {
    return { message: "입력 형식이 올바르지 않습니다", status: 400 };
  }
  return { message: "서버 오류가 발생했습니다", status: 500 };
}
