import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

import nodemailer from "nodemailer";
import {
  isEmailEnabled,
  canSendExternalEmail,
  sendEmail,
} from "@/lib/email";

describe("isEmailEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("두 환경변수가 모두 설정되면 true를 반환한다", () => {
    vi.stubEnv("GMAIL_USER", "test@gmail.com");
    vi.stubEnv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");
    expect(isEmailEnabled()).toBe(true);
  });

  it("GMAIL_USER가 없으면 false를 반환한다", () => {
    vi.stubEnv("GMAIL_USER", "");
    vi.stubEnv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");
    expect(isEmailEnabled()).toBe(false);
  });

  it("GMAIL_APP_PASSWORD가 없으면 false를 반환한다", () => {
    vi.stubEnv("GMAIL_USER", "test@gmail.com");
    vi.stubEnv("GMAIL_APP_PASSWORD", "");
    expect(isEmailEnabled()).toBe(false);
  });
});

describe("canSendExternalEmail", () => {
  it("외부 이메일은 true를 반환한다", () => {
    expect(canSendExternalEmail("teacher@school.kr")).toBe(true);
  });

  it("@student.internal 이메일은 false를 반환한다", () => {
    expect(canSendExternalEmail("s_한빛초_1_2_3@student.internal")).toBe(false);
  });

  it("빈 문자열은 false를 반환한다", () => {
    expect(canSendExternalEmail("")).toBe(false);
  });
});

describe("sendEmail", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("Gmail 설정이 없으면 발송을 건너뛴다", async () => {
    vi.stubEnv("GMAIL_USER", "");
    vi.stubEnv("GMAIL_APP_PASSWORD", "");

    const result = await sendEmail({
      to: "teacher@school.kr",
      subject: "테스트",
      text: "내용",
    });

    expect(result).toEqual({
      ok: true,
      skipped: true,
      reason: "Gmail SMTP is not configured",
    });
  });

  it("@student.internal 수신자는 발송을 건너뛴다", async () => {
    vi.stubEnv("GMAIL_USER", "test@gmail.com");
    vi.stubEnv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");

    const result = await sendEmail({
      to: "s_한빛초_1_2_3@student.internal",
      subject: "테스트",
      text: "내용",
    });

    expect(result).toEqual({
      ok: true,
      skipped: true,
      reason: "Recipient is not an external email",
    });
  });

  it("설정이 완료되면 nodemailer로 이메일을 발송하고 ok: true를 반환한다", async () => {
    vi.stubEnv("GMAIL_USER", "test@gmail.com");
    vi.stubEnv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");

    const sendMailMock = vi.fn().mockResolvedValue({ messageId: "msg-001" });
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: sendMailMock,
    } as ReturnType<typeof nodemailer.createTransport>);

    const result = await sendEmail({
      to: "teacher@school.kr",
      subject: "비밀번호 재설정",
      text: "링크: http://localhost:3000/reset-password?token=abc",
    });

    expect(result).toEqual({ ok: true });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "teacher@school.kr",
        subject: "비밀번호 재설정",
        from: expect.stringContaining("test@gmail.com"),
      })
    );
  });

  it("nodemailer 오류 시 ok: false와 에러 메시지를 반환한다", async () => {
    vi.stubEnv("GMAIL_USER", "test@gmail.com");
    vi.stubEnv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");

    const sendMailMock = vi.fn().mockRejectedValue(new Error("SMTP 연결 실패"));
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: sendMailMock,
    } as ReturnType<typeof nodemailer.createTransport>);

    const result = await sendEmail({
      to: "teacher@school.kr",
      subject: "테스트",
      text: "내용",
    });

    expect(result).toEqual({ ok: false, error: "SMTP 연결 실패" });
  });
});
