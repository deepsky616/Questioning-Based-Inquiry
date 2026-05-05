import type { UserRole } from "./user";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      school: string | null;
      grade: string | null;
      className: string | null;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    school: string | null;
    grade: string | null;
    className: string | null;
    studentNumber: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    school: string | null;
    grade: string | null;
    className: string | null;
  }
}
