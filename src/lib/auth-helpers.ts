import type { Session } from "next-auth";

export type SessionUser = {
  id: string;
  name?: string;
  role?: string;
  school?: string | null;
  grade?: string | null;
  className?: string | null;
  studentNumber?: string | null;
  isDemo: boolean;
};

export function getSessionUser(session: Session | null): SessionUser {
  const user = session?.user as {
    id?: string;
    name?: string | null;
    role?: string | null;
    school?: string | null;
    grade?: string | null;
    className?: string | null;
    studentNumber?: string | null;
    isDemo?: boolean | null;
  } | undefined;

  return {
    id: user?.id ?? "",
    name: user?.name ?? undefined,
    role: user?.role ?? undefined,
    school: user?.school ?? null,
    grade: user?.grade ?? null,
    className: user?.className ?? null,
    studentNumber: user?.studentNumber ?? null,
    isDemo: user?.isDemo === true,
  };
}
