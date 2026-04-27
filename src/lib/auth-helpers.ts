import type { Session } from "next-auth";

export type SessionUser = {
  id: string;
  name?: string;
  role?: string;
};

export function getSessionUser(session: Session | null): SessionUser {
  const user = session?.user as { id?: string; name?: string | null; role?: string | null } | undefined;

  return {
    id: user?.id ?? "",
    name: user?.name ?? undefined,
    role: user?.role ?? undefined,
  };
}
