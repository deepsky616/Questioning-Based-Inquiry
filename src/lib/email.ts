import nodemailer from "nodemailer";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type SendEmailResult =
  | { ok: true; skipped?: false }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

const INTERNAL_EMAIL_DOMAIN = "@student.internal";

export function isEmailEnabled(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

export function canSendExternalEmail(email: string): boolean {
  return Boolean(email && !email.endsWith(INTERNAL_EMAIL_DOMAIN));
}

function createTransporter() {
  const pass = (process.env.GMAIL_APP_PASSWORD ?? "").replace(/\s/g, "");
  console.log(
    `[email] user=${process.env.GMAIL_USER} pass_len=${pass.length}`
  );
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass,
    },
  });
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
}: SendEmailInput): Promise<SendEmailResult> {
  if (!isEmailEnabled()) {
    return { ok: true, skipped: true, reason: "Gmail SMTP is not configured" };
  }

  if (!canSendExternalEmail(to)) {
    return { ok: true, skipped: true, reason: "Recipient is not an external email" };
  }

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Question Lab" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown email error",
    };
  }
}

export async function sendTeacherWelcomeEmail(to: string, name: string): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: "Question Lab 교사 계정이 생성되었습니다",
    text: `${name} 선생님, Question Lab 교사 계정 생성이 완료되었습니다.\n\n로그인 후 학생 등록과 질문 세션을 시작할 수 있습니다.`,
    html: `<p>${escapeHtml(name)} 선생님, Question Lab 교사 계정 생성이 완료되었습니다.</p><p>로그인 후 학생 등록과 질문 세션을 시작할 수 있습니다.</p>`,
  });
}

export async function sendTeacherPasswordResetEmail({
  to,
  name,
  resetUrl,
}: {
  to: string;
  name: string;
  resetUrl: string;
}): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: "Question Lab 비밀번호 재설정",
    text: `${name} 선생님, 아래 링크에서 비밀번호를 재설정할 수 있습니다.\n\n${resetUrl}\n\n이 링크는 30분 동안만 사용할 수 있습니다. 요청하지 않았다면 이 메일을 무시해 주세요.`,
    html: [
      `<p>${escapeHtml(name)} 선생님, 아래 링크에서 비밀번호를 재설정할 수 있습니다.</p>`,
      `<p><a href="${escapeHtml(resetUrl)}">비밀번호 재설정하기</a></p>`,
      "<p>이 링크는 30분 동안만 사용할 수 있습니다. 요청하지 않았다면 이 메일을 무시해 주세요.</p>",
    ].join(""),
  });
}

export async function sendBulkStudentSummaryEmail({
  to,
  teacherName,
  school,
  grade,
  className,
  created,
  skipped,
  errors,
}: {
  to: string;
  teacherName: string;
  school: string;
  grade: string;
  className: string;
  created: number;
  skipped: number;
  errors: string[];
}): Promise<SendEmailResult> {
  const errorText = errors.length > 0 ? `\n실패: ${errors.join(", ")}` : "";

  return sendEmail({
    to,
    subject: "Question Lab 학생 일괄 등록 결과",
    text: `${teacherName} 선생님, 학생 일괄 등록이 완료되었습니다.\n\n대상: ${school} ${grade}학년 ${className}반\n생성: ${created}명\n건너뜀: ${skipped}명${errorText}`,
    html: [
      `<p>${escapeHtml(teacherName)} 선생님, 학생 일괄 등록이 완료되었습니다.</p>`,
      `<p>대상: ${escapeHtml(school)} ${escapeHtml(grade)}학년 ${escapeHtml(className)}반</p>`,
      `<ul><li>생성: ${created}명</li><li>건너뜀: ${skipped}명</li></ul>`,
      errors.length > 0 ? `<p>실패: ${escapeHtml(errors.join(", "))}</p>` : "",
    ].join(""),
  });
}

export async function sendQuestionNotificationEmail({
  to,
  teacherName,
  studentName,
  sessionTitle,
  question,
}: {
  to: string;
  teacherName: string;
  studentName: string;
  sessionTitle: string;
  question: string;
}): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: "Question Lab 새 질문이 등록되었습니다",
    text: `${teacherName} 선생님, ${studentName} 학생이 새 질문을 등록했습니다.\n\n세션: ${sessionTitle}\n질문: ${question}`,
    html: `<p>${escapeHtml(teacherName)} 선생님, ${escapeHtml(studentName)} 학생이 새 질문을 등록했습니다.</p><p><strong>세션:</strong> ${escapeHtml(sessionTitle)}</p><p><strong>질문:</strong> ${escapeHtml(question)}</p>`,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
