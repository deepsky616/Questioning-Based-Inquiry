export type UserRole = "STUDENT" | "TEACHER";

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  school: string | null;
  grade: string | null;
  className: string | null;
}

type SessionResult<T> =
  | { ok: true; user: T }
  | { ok: false; status: number; message: string };

export function extractSessionUser(session: unknown): AppUser | null {
  if (!session || typeof session !== "object") return null;
  const s = session as Record<string, unknown>;
  const user = s["user"];
  if (!user || typeof user !== "object") return null;
  const u = user as Record<string, unknown>;
  if (typeof u["id"] !== "string" || !u["id"]) return null;

  return {
    id: u["id"] as string,
    email: (u["email"] as string) ?? "",
    name: (u["name"] as string) ?? "",
    role: (u["role"] as UserRole) ?? "STUDENT",
    school: (u["school"] as string | null) ?? null,
    grade: (u["grade"] as string | null) ?? null,
    className: (u["className"] as string | null) ?? null,
  };
}

export function requireAuthSession(session: unknown): SessionResult<AppUser> {
  const user = extractSessionUser(session);
  if (!user) {
    return { ok: false, status: 401, message: "로그인이 필요합니다" };
  }
  return { ok: true, user };
}

export function requireTeacherSession(session: unknown): SessionResult<AppUser> {
  const result = requireAuthSession(session);
  if (!result.ok) return result;
  if (result.user.role !== "TEACHER") {
    return { ok: false, status: 403, message: "교사만 접근할 수 있습니다" };
  }
  return result;
}
