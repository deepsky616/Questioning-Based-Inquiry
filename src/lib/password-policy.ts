// 비밀번호 규칙: 숫자 + 영문(대/소) + 특수문자 3가지 조합, 8~16자
// 허용 특수문자: ! @ # $ % ^ & * ( ) _ +
export const ALLOWED_SPECIALS = "!@#$%^&*()_+";

export const PASSWORD_RULE_TEXT =
  "비밀번호는 숫자 + 영문 대/소문자 + 특수문자, 3가지를 조합하여 8~16자로 입력해주세요. " +
  "(사용 가능한 특수문자: ! @ # $ % ^ & * ( ) _ +)";

/** 규칙 위반 시 한글 오류 메시지, 통과 시 null */
export function validatePasswordPolicy(pw: string): string | null {
  if (pw.length < 8 || pw.length > 16) {
    return "비밀번호는 8~16자로 입력해주세요.";
  }
  if (!/^[A-Za-z0-9!@#$%^&*()_+]+$/.test(pw)) {
    return "사용할 수 없는 문자가 있어요. 영문, 숫자, 특수문자(! @ # $ % ^ & * ( ) _ +)만 사용해주세요.";
  }
  const hasLetter = /[A-Za-z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  const hasSpecial = /[!@#$%^&*()_+]/.test(pw);
  if (!(hasLetter && hasDigit && hasSpecial)) {
    return "숫자, 영문(대/소문자), 특수문자 3가지를 모두 조합해주세요.";
  }
  return null;
}
